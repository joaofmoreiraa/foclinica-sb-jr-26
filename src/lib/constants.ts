import type { AppointmentStatus, Role, Specialty } from './types'

export const SPECIALTIES: Array<{ value: Specialty; label: string }> = [
  { value: 'dermatologia', label: 'Dermatologia' },
  { value: 'cardiologia', label: 'Cardiologia' },
  { value: 'pediatria', label: 'Pediatria' },
  { value: 'veterinaria_focas', label: 'Veterinária (apenas focas)' },
  { value: 'urologia', label: 'Urologia' },
  { value: 'nutricao', label: 'Nutrição' },
  { value: 'ortopedia', label: 'Ortopedia' },
  { value: 'oftalmologia', label: 'Oftalmologia' }
]

export const ROLE_LABEL: Record<Role, string> = {
  paciente: 'Paciente',
  medico: 'Médico',
  atendente: 'Atendente'
}

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: 'Aguardando aprovação',
  confirmed: 'Confirmado',
  rejected: 'Rejeitado',
  cancelled: 'Cancelado',
  reschedule_requested: 'Reagendamento solicitado',
  doctor_cancel_requested: 'Cancelamento solicitado pelo médico'
}

export function specialtyLabel(value?: Specialty | null) {
  return SPECIALTIES.find((item) => item.value === value)?.label ?? 'Especialidade'
}
