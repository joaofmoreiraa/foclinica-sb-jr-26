export type Role = 'paciente' | 'medico' | 'atendente'

export type Specialty =
  | 'dermatologia'
  | 'cardiologia'
  | 'pediatria'
  | 'veterinaria_focas'
  | 'urologia'
  | 'nutricao'
  | 'ortopedia'
  | 'oftalmologia'

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'reschedule_requested'
  | 'doctor_cancel_requested'

export type Profile = {
  id: string
  name: string
  email: string
  phone: string | null
  role: Role
  specialties: Specialty[]
  created_at?: string
}

export type AvailableSlot = {
  id: string
  doctor_id: string
  doctor_name: string
  doctor_specialties: Specialty[]
  specialty: Specialty
  starts_at: string
  ends_at: string
}

export type AppointmentDetails = {
  id: string
  patient_id: string
  patient_name: string
  patient_email: string
  patient_phone: string | null
  doctor_id: string
  doctor_name: string
  specialty: Specialty
  slot_id: string
  slot_starts_at: string
  slot_ends_at: string
  requested_slot_id: string | null
  requested_starts_at: string | null
  requested_specialty: Specialty | null
  requested_doctor_name: string | null
  status: AppointmentStatus
  created_at: string
  updated_at: string
}
