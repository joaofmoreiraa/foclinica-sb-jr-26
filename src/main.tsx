import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { ROLE_LABEL, SPECIALTIES, STATUS_LABEL, specialtyLabel } from './lib/constants'
import { formatDateTime, toDatetimeLocalValue, toIsoFromDatetimeLocal } from './lib/format'
import type { AppointmentDetails, AppointmentStatus, AvailableSlot, Profile, Role, Specialty } from './lib/types'
import './styles.css'

type AuthContextValue = {
  user: User | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider')
  return ctx
}

function useRoute() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = (nextPath: string) => {
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return { path, navigate }
}

async function getProfile(userId: string) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data as Profile | null
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = async () => {
    if (!supabase || !user) return
    const freshProfile = await getProfile(user.id)
    setProfile(freshProfile)
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let ignore = false

    supabase.auth.getSession().then(async ({ data }) => {
      if (ignore) return
      const sessionUser = data.session?.user ?? null
      setUser(sessionUser)
      setProfile(sessionUser ? await getProfile(sessionUser.id) : null)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null
      setUser(sessionUser)
      if (!sessionUser) {
        setProfile(null)
        setLoading(false)
        return
      }

      getProfile(sessionUser.id)
        .then(setProfile)
        .finally(() => setLoading(false))
    })

    return () => {
      ignore = true
      listener.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    profile,
    loading,
    refreshProfile,
    signOut: async () => {
      if (!supabase) return
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
    }
  }), [user, profile, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function Header({ navigate }: { navigate: (path: string) => void }) {
  const { user, profile, signOut } = useAuth()

  const goDashboard = () => {
    if (!profile) return navigate('/login')
    navigate(`/dashboard/${profile.role}`)
  }

  return (
    <header className="header">
      <div className="container header-content">
        <div className="brand" onClick={() => navigate('/')} role="button" tabIndex={0}>
          <div className="brand-mark">🦭</div>
          <div className="brand-title">
            <span>Foclínica</span>
            <span>Foca na saúde</span>
          </div>
        </div>
        <nav className="nav-actions">
          <button className="btn ghost" onClick={() => navigate('/')}>Início</button>
          {user && profile ? (
            <>
              <span className="badge">{ROLE_LABEL[profile.role]}</span>
              <button className="btn" onClick={goDashboard}>Dashboard</button>
              <button className="btn danger" onClick={async () => { await signOut(); navigate('/') }}>Sair</button>
            </>
          ) : (
            <button className="btn primary" onClick={() => navigate('/login')}>Entrar</button>
          )}
        </nav>
      </div>
    </header>
  )
}

function App() {
  const route = useRoute()

  return (
    <AuthProvider>
      <div className="app-shell">
        <Header navigate={route.navigate} />
        <main>
          <Routes path={route.path} navigate={route.navigate} />
        </main>
        <footer className="footer">
          <div className="container">🦭 Foclínica — Foca na saúde.</div>
        </footer>
      </div>
    </AuthProvider>
  )
}

function Routes({ path, navigate }: { path: string; navigate: (path: string) => void }) {
  if (path === '/login') return <AuthPage navigate={navigate} />
  if (path === '/dashboard') return <DashboardRouter navigate={navigate} />
  if (path === '/dashboard/paciente') return <Protected role="paciente" navigate={navigate}><PatientDashboard /></Protected>
  if (path === '/dashboard/medico') return <Protected role="medico" navigate={navigate}><DoctorDashboard /></Protected>
  if (path === '/dashboard/atendente') return <Protected role="atendente" navigate={navigate}><AttendantDashboard /></Protected>
  return <Landing navigate={navigate} />
}

function Protected({ role, navigate, children }: { role: Role; navigate: (path: string) => void; children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (!user) navigate('/login')
    else if (profile && profile.role !== role) navigate(`/dashboard/${profile.role}`)
  }, [loading, user, profile, role])

  if (loading) return <LoadingPage text="Carregando sua área da Foclínica..." />
  if (!user) return null
  if (!profile) return <SetupNotice />
  if (profile.role !== role) return null
  return <>{children}</>
}

function DashboardRouter({ navigate }: { navigate: (path: string) => void }) {
  const { user, profile, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (!user) navigate('/login')
    if (profile) navigate(`/dashboard/${profile.role}`)
  }, [loading, user, profile])

  if (loading) return <LoadingPage text="Abrindo seu painel..." />
  if (!user) return null
  if (!profile) return <SetupNotice />
  return null
}

function LoadingPage({ text }: { text: string }) {
  return (
    <div className="container section">
      <div className="card soft">
        <span className="badge">🦭 Aguarde</span>
        <h2>{text}</h2>
      </div>
    </div>
  )
}

function SetupNotice() {
  return (
    <div className="container section">
      <div className="notice error">
        Seu usuário foi autenticado, mas o perfil ainda não foi criado. Confira se o arquivo <strong>sql/schema.sql</strong> foi executado no Supabase antes do cadastro.
      </div>
    </div>
  )
}

function Landing({ navigate }: { navigate: (path: string) => void }) {
  return (
    <>
      <section className="container hero">
        <div>
          <span className="badge">🦭 Clínica digital</span>
          <h1>Foca na saúde.</h1>
          <p>
            Um site clean para pacientes, médicos e atendentes gerenciarem consultas com dermatologia, cardiologia, pediatria, veterinária para focas, urologia, nutrição, ortopedia e oftalmologia.
          </p>
          <div className="nav-actions">
            <button className="btn primary" onClick={() => navigate('/login')}>Começar agora</button>
            <button className="btn" onClick={() => navigate('/dashboard')}>Abrir painel</button>
          </div>
        </div>
        <div className="hero-card">
          <div className="mascot">
            <div className="mascot-face">🦭</div>
            <div className="float-pill">Olá! Sou a foca da Foclínica. Vou te ajudar a achar o melhor horário.</div>
          </div>
        </div>
      </section>

      <section className="container section">
        <div className="section-title">
          <h2>Fluxos principais</h2>
        </div>
        <div className="grid three">
          <div className="card">
            <h3>Paciente</h3>
            <p>Filtra especialidade, visualiza horários livres, solicita agendamento, cancela consultas e pede reagendamento.</p>
          </div>
          <div className="card">
            <h3>Médico</h3>
            <p>Consulta agenda ocupada, identifica pacientes e solicita cancelamento quando necessário.</p>
          </div>
          <div className="card">
            <h3>Atendente</h3>
            <p>Gerencia solicitações, filtra por área, aprova ou rejeita pedidos e cria novos horários vinculados aos médicos.</p>
          </div>
        </div>
      </section>
    </>
  )
}

function AuthPage({ navigate }: { navigate: (path: string) => void }) {
  const { profile, loading } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('paciente')
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && profile) navigate(`/dashboard/${profile.role}`)
  }, [loading, profile])

  const toggleSpecialty = (specialty: Specialty) => {
    setSpecialties((current) => current.includes(specialty)
      ? current.filter((item) => item !== specialty)
      : [...current, specialty]
    )
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage(null)

    if (!supabase) {
      setMessage({ type: 'error', text: 'Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.local.' })
      return
    }

    if (mode === 'register' && role === 'medico' && specialties.length === 0) {
      setMessage({ type: 'error', text: 'Selecione pelo menos uma área para cadastro como médico.' })
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/dashboard')
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name,
              email,
              phone,
              role,
              specialties: role === 'medico' ? specialties : []
            }
          }
        })
        if (error) throw error
        setMessage({ type: 'success', text: 'Cadastro criado. Se a confirmação por e-mail estiver ativa no Supabase, confirme o e-mail antes de entrar.' })
        setMode('login')
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível concluir a ação.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="container auth-wrap">
      <div className="card soft">
        <span className="badge">🦭 Foca na saúde</span>
        <h2>Entre ou crie sua conta</h2>
        <p>
          O mesmo login atende os três perfis: paciente, médico ou atendente. O papel escolhido no cadastro define qual dashboard será aberto.
        </p>
        {!isSupabaseConfigured && (
          <div className="notice error">
            O Supabase ainda não foi configurado. Crie um arquivo <strong>.env.local</strong> com as variáveis do <strong>.env.example</strong>.
          </div>
        )}
      </div>

      <div className="card">
        <div className="tabs" aria-label="Modo de autenticação">
          <button className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>Login</button>
          <button className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>Cadastro</button>
        </div>

        <form className="form" onSubmit={submit} style={{ marginTop: 18 }}>
          {mode === 'register' && (
            <>
              <div className="field">
                <label htmlFor="name">Nome</label>
                <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="phone">Telefone</label>
                <input id="phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" required />
              </div>
              <div className="field">
                <label htmlFor="role">Cadastrar como</label>
                <select id="role" className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  <option value="paciente">Paciente</option>
                  <option value="medico">Médico</option>
                  <option value="atendente">Atendente</option>
                </select>
              </div>
              {role === 'medico' && (
                <div className="field">
                  <label>Áreas do médico</label>
                  <div className="checkbox-grid">
                    {SPECIALTIES.map((item) => (
                      <label className="checkbox-pill" key={item.value}>
                        <input type="checkbox" checked={specialties.includes(item.value)} onChange={() => toggleSpecialty(item.value)} />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input id="password" className="input" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          {message && <div className={`notice ${message.type}`}>{message.text}</div>}
          <button className="btn primary" disabled={submitting || !isSupabaseConfigured}>
            {submitting ? 'Enviando...' : mode === 'login' ? 'Entrar' : 'Criar cadastro'}
          </button>
        </form>
      </div>
    </section>
  )
}

function DashboardIntro({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="dashboard-hero">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <span className="badge">🦭 Foclínica</span>
    </div>
  )
}

function statusBadgeClass(status: AppointmentStatus) {
  if (status === 'confirmed') return 'success'
  if (status === 'cancelled' || status === 'rejected') return 'danger'
  return 'warning'
}

function PatientDashboard() {
  const { profile } = useAuth()
  const [specialty, setSpecialty] = useState<Specialty | 'all'>('all')
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [appointments, setAppointments] = useState<AppointmentDetails[]>([])
  const [rescheduleFor, setRescheduleFor] = useState<string | null>(null)
  const [rescheduleSlot, setRescheduleSlot] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  const loadData = async () => {
    if (!supabase || !profile) return
    setLoading(true)
    const availableQuery = supabase.from('available_slots').select('*').order('starts_at', { ascending: true })
    if (specialty !== 'all') availableQuery.eq('specialty', specialty)
    const [{ data: available, error: availableError }, { data: myAppointments, error: appointmentsError }] = await Promise.all([
      availableQuery,
      supabase
        .from('appointment_details')
        .select('*')
        .eq('patient_id', profile.id)
        .order('slot_starts_at', { ascending: true })
    ])

    if (availableError || appointmentsError) {
      setMessage((availableError ?? appointmentsError)?.message ?? 'Erro ao carregar dados')
    } else {
      setSlots((available ?? []) as AvailableSlot[])
      setAppointments((myAppointments ?? []) as AppointmentDetails[])
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [specialty, profile?.id])

  const schedule = async (slotId: string) => {
    if (!supabase || !profile) return
    setMessage(null)
    const { error } = await supabase.from('appointments').insert({ patient_id: profile.id, slot_id: slotId, status: 'pending' })
    if (error) setMessage(error.message)
    else {
      setMessage('Solicitação de agendamento enviada para a atendente.')
      await loadData()
    }
  }

  const cancelAppointment = async (appointmentId: string) => {
    if (!supabase) return
    setMessage(null)
    const { error } = await supabase.from('appointments').update({ status: 'cancelled', requested_slot_id: null }).eq('id', appointmentId)
    if (error) setMessage(error.message)
    else {
      setMessage('Agendamento cancelado.')
      await loadData()
    }
  }

  const requestReschedule = async (appointmentId: string) => {
    if (!supabase || !rescheduleSlot) return
    setMessage(null)
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'reschedule_requested', requested_slot_id: rescheduleSlot })
      .eq('id', appointmentId)

    if (error) setMessage(error.message)
    else {
      setRescheduleFor(null)
      setRescheduleSlot('')
      setMessage('Solicitação de reagendamento enviada para análise.')
      await loadData()
    }
  }

  const activeAppointments = appointments.filter((item) => item.status !== 'cancelled' && item.status !== 'rejected')

  return (
    <section className="container dashboard">
      <DashboardIntro title={`Olá, ${profile?.name ?? 'paciente'}!`} subtitle="Escolha uma especialidade, veja os horários disponíveis e solicite seu agendamento." />
      {message && <div className="notice" style={{ marginBottom: 16 }}>{message}</div>}

      <div className="grid two">
        <div className="card">
          <div className="section-title">
            <h2>Horários disponíveis</h2>
          </div>
          <div className="toolbar">
            <div className="field">
              <label>Filtrar por área</label>
              <select className="select" value={specialty} onChange={(e) => setSpecialty(e.target.value as Specialty | 'all')}>
                <option value="all">Todas as especialidades</option>
                {SPECIALTIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
          </div>
          {loading ? <div className="empty">Carregando horários...</div> : (
            <div className="list">
              {slots.length === 0 && <div className="empty">Nenhum horário disponível nesse filtro.</div>}
              {slots.map((slot) => (
                <div className="row-card" key={slot.id}>
                  <div>
                    <strong>{specialtyLabel(slot.specialty)}</strong>
                    <div className="row-meta">
                      <span className="badge">{formatDateTime(slot.starts_at)}</span>
                      <span className="badge">Dr(a). {slot.doctor_name}</span>
                    </div>
                  </div>
                  <div className="row-actions">
                    <button className="btn primary small" onClick={() => schedule(slot.id)}>Solicitar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-title">
            <h2>Meus agendamentos</h2>
          </div>
          <div className="list">
            {activeAppointments.length === 0 && <div className="empty">Você ainda não tem agendamentos ativos.</div>}
            {activeAppointments.map((appointment) => (
              <div className="row-card" key={appointment.id}>
                <div>
                  <strong>{specialtyLabel(appointment.specialty)}</strong>
                  <div className="row-meta">
                    <span className="badge">{formatDateTime(appointment.slot_starts_at)}</span>
                    <span className="badge">Dr(a). {appointment.doctor_name}</span>
                    <span className={`badge ${statusBadgeClass(appointment.status)}`}>{STATUS_LABEL[appointment.status]}</span>
                  </div>
                  {appointment.requested_starts_at && (
                    <p>Reagendamento pedido para {formatDateTime(appointment.requested_starts_at)} com {appointment.requested_doctor_name}.</p>
                  )}
                  {rescheduleFor === appointment.id && (
                    <div className="form" style={{ marginTop: 12 }}>
                      <div className="field">
                        <label>Novo horário disponível</label>
                        <select className="select" value={rescheduleSlot} onChange={(e) => setRescheduleSlot(e.target.value)}>
                          <option value="">Selecione</option>
                          {slots.map((slot) => (
                            <option key={slot.id} value={slot.id}>{specialtyLabel(slot.specialty)} - {formatDateTime(slot.starts_at)} - {slot.doctor_name}</option>
                          ))}
                        </select>
                      </div>
                      <button className="btn primary small" onClick={() => requestReschedule(appointment.id)} disabled={!rescheduleSlot}>Enviar reagendamento</button>
                    </div>
                  )}
                </div>
                <div className="row-actions">
                  <button className="btn small" onClick={() => setRescheduleFor(rescheduleFor === appointment.id ? null : appointment.id)}>Reagendar</button>
                  <button className="btn danger small" onClick={() => cancelAppointment(appointment.id)}>Cancelar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function DoctorDashboard() {
  const { profile } = useAuth()
  const [appointments, setAppointments] = useState<AppointmentDetails[]>([])
  const [specialty, setSpecialty] = useState<Specialty | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  const doctorSpecialties = profile?.specialties ?? []

  const loadAppointments = async () => {
    if (!supabase || !profile) return
    setLoading(true)
    let query = supabase
      .from('appointment_details')
      .select('*')
      .eq('doctor_id', profile.id)
      .not('status', 'in', '(cancelled,rejected)')
      .order('slot_starts_at', { ascending: true })

    if (specialty !== 'all') query = query.eq('specialty', specialty)
    const { data, error } = await query
    if (error) setMessage(error.message)
    else setAppointments((data ?? []) as AppointmentDetails[])
    setLoading(false)
  }

  useEffect(() => { loadAppointments() }, [profile?.id, specialty])

  const requestCancel = async (appointmentId: string) => {
    if (!supabase) return
    setMessage(null)
    const { error } = await supabase.from('appointments').update({ status: 'doctor_cancel_requested' }).eq('id', appointmentId)
    if (error) setMessage(error.message)
    else {
      setMessage('Solicitação de cancelamento enviada para a atendente.')
      await loadAppointments()
    }
  }

  return (
    <section className="container dashboard">
      <DashboardIntro title={`Agenda médica de ${profile?.name ?? 'médico'}`} subtitle="Veja seus horários ocupados e solicite cancelamento quando necessário." />
      {message && <div className="notice" style={{ marginBottom: 16 }}>{message}</div>}

      <div className="card">
        <div className="toolbar">
          <div className="field">
            <label>Filtrar por área</label>
            <select className="select" value={specialty} onChange={(e) => setSpecialty(e.target.value as Specialty | 'all')}>
              <option value="all">Todas as minhas áreas</option>
              {doctorSpecialties.map((value) => <option key={value} value={value}>{specialtyLabel(value)}</option>)}
            </select>
          </div>
        </div>
        {loading ? <div className="empty">Carregando agenda...</div> : (
          <div className="list">
            {appointments.length === 0 && <div className="empty">Nenhum horário ocupado encontrado.</div>}
            {appointments.map((appointment) => (
              <div className="row-card" key={appointment.id}>
                <div>
                  <strong>{specialtyLabel(appointment.specialty)}</strong>
                  <div className="row-meta">
                    <span className="badge">{formatDateTime(appointment.slot_starts_at)}</span>
                    <span className="badge">Paciente: {appointment.patient_name}</span>
                    <span className={`badge ${statusBadgeClass(appointment.status)}`}>{STATUS_LABEL[appointment.status]}</span>
                  </div>
                  <p>{appointment.patient_email} {appointment.patient_phone ? `• ${appointment.patient_phone}` : ''}</p>
                </div>
                <div className="row-actions">
                  <button className="btn danger small" onClick={() => requestCancel(appointment.id)} disabled={appointment.status === 'doctor_cancel_requested'}>
                    Solicitar cancelamento
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function AttendantDashboard() {
  const { profile } = useAuth()
  const [doctors, setDoctors] = useState<Profile[]>([])
  const [appointments, setAppointments] = useState<AppointmentDetails[]>([])
  const [specialty, setSpecialty] = useState<Specialty | 'all'>('all')
  const [doctorId, setDoctorId] = useState('')
  const [slotSpecialty, setSlotSpecialty] = useState<Specialty>('dermatologia')
  const [slotDate, setSlotDate] = useState(toDatetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)))
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const selectedDoctor = doctors.find((doctor) => doctor.id === doctorId)
  const allowedSpecialties = selectedDoctor?.specialties?.length ? selectedDoctor.specialties : SPECIALTIES.map((item) => item.value)

  const loadData = async () => {
    if (!supabase) return
    setLoading(true)
    let appointmentQuery = supabase
      .from('appointment_details')
      .select('*')
      .order('slot_starts_at', { ascending: true })

    if (specialty !== 'all') appointmentQuery = appointmentQuery.eq('specialty', specialty)

    const [{ data: doctorData, error: doctorError }, { data: appointmentData, error: appointmentError }] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'medico').order('name', { ascending: true }),
      appointmentQuery
    ])

    if (doctorError || appointmentError) {
      setMessage((doctorError ?? appointmentError)?.message ?? 'Erro ao carregar dados')
    } else {
      const doctorsList = (doctorData ?? []) as Profile[]
      setDoctors(doctorsList)
      if (!doctorId && doctorsList[0]) setDoctorId(doctorsList[0].id)
      setAppointments((appointmentData ?? []) as AppointmentDetails[])
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [specialty])

  useEffect(() => {
    if (selectedDoctor && !allowedSpecialties.includes(slotSpecialty)) {
      setSlotSpecialty(allowedSpecialties[0])
    }
  }, [doctorId])

  const addSlot = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!supabase || !profile || !doctorId) return
    setMessage(null)

    const { error } = await supabase.from('availability_slots').insert({
      doctor_id: doctorId,
      specialty: slotSpecialty,
      starts_at: toIsoFromDatetimeLocal(slotDate),
      created_by: profile.id
    })

    if (error) setMessage(error.message)
    else {
      setMessage('Novo horário adicionado com sucesso.')
      setSlotDate(toDatetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)))
      await loadData()
    }
  }

  const updateAppointment = async (appointmentId: string, patch: Record<string, unknown>, successMessage: string) => {
    if (!supabase) return
    setMessage(null)
    const { error } = await supabase.from('appointments').update(patch).eq('id', appointmentId)
    if (error) setMessage(error.message)
    else {
      setMessage(successMessage)
      await loadData()
    }
  }

  const accept = async (appointment: AppointmentDetails) => {
    if (appointment.status === 'pending') {
      await updateAppointment(appointment.id, { status: 'confirmed' }, 'Agendamento aprovado.')
    } else if (appointment.status === 'reschedule_requested' && appointment.requested_slot_id) {
      await updateAppointment(appointment.id, {
        slot_id: appointment.requested_slot_id,
        requested_slot_id: null,
        status: 'confirmed'
      }, 'Reagendamento aprovado.')
    } else if (appointment.status === 'doctor_cancel_requested') {
      await updateAppointment(appointment.id, { status: 'cancelled', requested_slot_id: null }, 'Cancelamento aprovado.')
    }
  }

  const reject = async (appointment: AppointmentDetails) => {
    if (appointment.status === 'pending') {
      await updateAppointment(appointment.id, { status: 'rejected' }, 'Agendamento rejeitado.')
    } else if (appointment.status === 'reschedule_requested') {
      await updateAppointment(appointment.id, { status: 'confirmed', requested_slot_id: null }, 'Reagendamento rejeitado; consulta original mantida.')
    } else if (appointment.status === 'doctor_cancel_requested') {
      await updateAppointment(appointment.id, { status: 'confirmed' }, 'Cancelamento rejeitado; consulta mantida.')
    }
  }

  const pending = appointments.filter((item) => ['pending', 'reschedule_requested', 'doctor_cancel_requested'].includes(item.status))
  const active = appointments.filter((item) => !['cancelled', 'rejected'].includes(item.status))

  return (
    <section className="container dashboard">
      <DashboardIntro title={`Painel da atendente${profile?.name ? ` ${profile.name}` : ''}`} subtitle="Acompanhe solicitações, filtre por área e crie horários para médicos." />
      {message && <div className="notice" style={{ marginBottom: 16 }}>{message}</div>}

      <div className="grid two">
        <div className="card">
          <div className="section-title">
            <h2>Adicionar horário</h2>
          </div>
          <form className="form" onSubmit={addSlot}>
            <div className="field">
              <label>Médico</label>
              <select className="select" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} required>
                <option value="">Selecione um médico</option>
                {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Área</label>
              <select className="select" value={slotSpecialty} onChange={(e) => setSlotSpecialty(e.target.value as Specialty)} required>
                {allowedSpecialties.map((value) => <option key={value} value={value}>{specialtyLabel(value)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Data e horário</label>
              <input className="input" type="datetime-local" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} required />
            </div>
            <button className="btn primary" disabled={!doctorId}>Adicionar horário</button>
          </form>
        </div>

        <div className="card">
          <div className="section-title">
            <h2>Solicitações</h2>
          </div>
          {loading ? <div className="empty">Carregando solicitações...</div> : (
            <div className="list">
              {pending.length === 0 && <div className="empty">Nenhuma solicitação pendente.</div>}
              {pending.map((appointment) => (
                <div className="row-card" key={appointment.id}>
                  <div>
                    <strong>{STATUS_LABEL[appointment.status]}</strong>
                    <div className="row-meta">
                      <span className="badge">{specialtyLabel(appointment.specialty)}</span>
                      <span className="badge">{formatDateTime(appointment.slot_starts_at)}</span>
                      <span className="badge">Paciente: {appointment.patient_name}</span>
                      <span className="badge">Dr(a). {appointment.doctor_name}</span>
                    </div>
                    {appointment.requested_starts_at && (
                      <p>Novo horário solicitado: {formatDateTime(appointment.requested_starts_at)} com {appointment.requested_doctor_name}.</p>
                    )}
                  </div>
                  <div className="row-actions">
                    <button className="btn primary small" onClick={() => accept(appointment)}>Aceitar</button>
                    <button className="btn danger small" onClick={() => reject(appointment)}>Rejeitar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="section-title">
          <h2>Horários marcados</h2>
        </div>
        <div className="toolbar">
          <div className="field">
            <label>Filtrar por área</label>
            <select className="select" value={specialty} onChange={(e) => setSpecialty(e.target.value as Specialty | 'all')}>
              <option value="all">Todas as especialidades</option>
              {SPECIALTIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
        </div>
        <div className="list">
          {active.length === 0 && <div className="empty">Nenhum horário marcado no filtro atual.</div>}
          {active.map((appointment) => (
            <div className="row-card" key={appointment.id}>
              <div>
                <strong>{specialtyLabel(appointment.specialty)}</strong>
                <div className="row-meta">
                  <span className="badge">{formatDateTime(appointment.slot_starts_at)}</span>
                  <span className="badge">Paciente: {appointment.patient_name}</span>
                  <span className="badge">Dr(a). {appointment.doctor_name}</span>
                  <span className={`badge ${statusBadgeClass(appointment.status)}`}>{STATUS_LABEL[appointment.status]}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
