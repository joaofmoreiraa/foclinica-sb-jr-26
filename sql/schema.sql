-- Foclínica - Supabase schema
-- Execute este arquivo no SQL Editor do Supabase antes de cadastrar usuários.

create extension if not exists pgcrypto;

do $$
begin
  create type public.user_role as enum ('paciente', 'medico', 'atendente');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.medical_specialty as enum (
    'dermatologia',
    'cardiologia',
    'pediatria',
    'veterinaria_focas',
    'urologia',
    'nutricao',
    'ortopedia',
    'oftalmologia'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.appointment_status as enum (
    'pending',
    'confirmed',
    'rejected',
    'cancelled',
    'reschedule_requested',
    'doctor_cancel_requested'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  role public.user_role not null default 'paciente',
  specialties public.medical_specialty[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint doctor_specialties_required check (role <> 'medico' or array_length(specialties, 1) is not null)
);

create table if not exists public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.profiles(id) on delete cascade,
  specialty public.medical_specialty not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint unique_doctor_time unique (doctor_id, starts_at)
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  slot_id uuid not null references public.availability_slots(id) on delete cascade,
  requested_slot_id uuid references public.availability_slots(id) on delete set null,
  status public.appointment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint no_same_reschedule_slot check (requested_slot_id is null or requested_slot_id <> slot_id),
  constraint pending_without_requested_slot check (status <> 'pending' or requested_slot_id is null),
  constraint reschedule_requires_requested_slot check (status <> 'reschedule_requested' or requested_slot_id is not null)
);


create or replace function public.set_slot_end_time()
returns trigger
language plpgsql
as $$
begin
  if new.ends_at is null or new.ends_at <= new.starts_at then
    new.ends_at = new.starts_at + interval '30 minutes';
  end if;
  return new;
end;
$$;

drop trigger if exists availability_slots_set_end_time on public.availability_slots;
create trigger availability_slots_set_end_time
before insert or update on public.availability_slots
for each row execute function public.set_slot_end_time();

create unique index if not exists one_active_appointment_per_slot
  on public.appointments(slot_id)
  where status in ('pending', 'confirmed', 'reschedule_requested', 'doctor_cancel_requested');

create unique index if not exists one_active_reschedule_request_per_slot
  on public.appointments(requested_slot_id)
  where status = 'reschedule_requested';

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists appointments_touch_updated_at on public.appointments;
create trigger appointments_touch_updated_at
before update on public.appointments
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_role public.user_role := 'paciente'::public.user_role;
  chosen_specialties public.medical_specialty[] := '{}';
begin
  if new.raw_user_meta_data ? 'role' then
    chosen_role := (new.raw_user_meta_data->>'role')::public.user_role;
  end if;

  if new.raw_user_meta_data ? 'specialties' then
    select coalesce(array_agg(value::public.medical_specialty), '{}')
      into chosen_specialties
    from jsonb_array_elements_text(new.raw_user_meta_data->'specialties') as value;
  end if;

  if chosen_role <> 'medico' then
    chosen_specialties := '{}';
  end if;

  insert into public.profiles (id, name, email, phone, role, specialties)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data->>'phone', ''),
    chosen_role,
    chosen_specialties
  )
  on conflict (id) do update set
    name = excluded.name,
    email = excluded.email,
    phone = excluded.phone,
    role = excluded.role,
    specialties = excluded.specialties;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_attendant()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'atendente');
$$;

create or replace function public.is_patient()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'paciente');
$$;

alter table public.profiles enable row level security;
alter table public.availability_slots enable row level security;
alter table public.appointments enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "slots_select_authenticated" on public.availability_slots;
create policy "slots_select_authenticated"
on public.availability_slots
for select
to authenticated
using (true);

drop policy if exists "slots_insert_attendant" on public.availability_slots;
create policy "slots_insert_attendant"
on public.availability_slots
for insert
to authenticated
with check (public.is_attendant());

drop policy if exists "slots_update_attendant" on public.availability_slots;
create policy "slots_update_attendant"
on public.availability_slots
for update
to authenticated
using (public.is_attendant())
with check (public.is_attendant());

drop policy if exists "slots_delete_attendant" on public.availability_slots;
create policy "slots_delete_attendant"
on public.availability_slots
for delete
to authenticated
using (public.is_attendant());

drop policy if exists "appointments_select_patient" on public.appointments;
create policy "appointments_select_patient"
on public.appointments
for select
to authenticated
using (patient_id = auth.uid());

drop policy if exists "appointments_select_doctor" on public.appointments;
create policy "appointments_select_doctor"
on public.appointments
for select
to authenticated
using (
  exists (
    select 1 from public.availability_slots s
    where s.id = appointments.slot_id
      and s.doctor_id = auth.uid()
  )
);

drop policy if exists "appointments_select_attendant" on public.appointments;
create policy "appointments_select_attendant"
on public.appointments
for select
to authenticated
using (public.is_attendant());

drop policy if exists "appointments_insert_patient" on public.appointments;
create policy "appointments_insert_patient"
on public.appointments
for insert
to authenticated
with check (
  patient_id = auth.uid()
  and public.is_patient()
  and status = 'pending'
  and requested_slot_id is null
);

drop policy if exists "appointments_update_patient_requests" on public.appointments;
create policy "appointments_update_patient_requests"
on public.appointments
for update
to authenticated
using (patient_id = auth.uid())
with check (
  patient_id = auth.uid()
  and status in ('cancelled', 'reschedule_requested')
);

drop policy if exists "appointments_update_doctor_cancel" on public.appointments;
create policy "appointments_update_doctor_cancel"
on public.appointments
for update
to authenticated
using (
  status in ('pending', 'confirmed')
  and exists (
    select 1 from public.availability_slots s
    where s.id = appointments.slot_id
      and s.doctor_id = auth.uid()
  )
)
with check (status = 'doctor_cancel_requested');

drop policy if exists "appointments_update_attendant" on public.appointments;
create policy "appointments_update_attendant"
on public.appointments
for update
to authenticated
using (public.is_attendant())
with check (public.is_attendant());

create or replace view public.available_slots
as
select
  s.id,
  s.doctor_id,
  d.name as doctor_name,
  d.specialties as doctor_specialties,
  s.specialty,
  s.starts_at,
  s.ends_at
from public.availability_slots s
join public.profiles d on d.id = s.doctor_id
where s.starts_at > now()
  and not exists (
    select 1
    from public.appointments a
    where a.status in ('pending', 'confirmed', 'reschedule_requested', 'doctor_cancel_requested')
      and (a.slot_id = s.id or a.requested_slot_id = s.id)
  );

create or replace view public.appointment_details
with (security_invoker = true)
as
select
  a.id,
  a.patient_id,
  p.name as patient_name,
  p.email as patient_email,
  p.phone as patient_phone,
  s.doctor_id,
  d.name as doctor_name,
  s.specialty,
  a.slot_id,
  s.starts_at as slot_starts_at,
  s.ends_at as slot_ends_at,
  a.requested_slot_id,
  rs.starts_at as requested_starts_at,
  rs.specialty as requested_specialty,
  rd.name as requested_doctor_name,
  a.status,
  a.created_at,
  a.updated_at
from public.appointments a
join public.profiles p on p.id = a.patient_id
join public.availability_slots s on s.id = a.slot_id
join public.profiles d on d.id = s.doctor_id
left join public.availability_slots rs on rs.id = a.requested_slot_id
left join public.profiles rd on rd.id = rs.doctor_id;

grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;
grant select, insert, update, delete on public.availability_slots to authenticated;
grant select, insert, update on public.appointments to authenticated;
grant select on public.available_slots to authenticated;
grant select on public.appointment_details to authenticated;
