export function formatDateTime(value?: string | null) {
  if (!value) return 'Sem data'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value))
}

export function toDatetimeLocalValue(date = new Date()) {
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

export function toIsoFromDatetimeLocal(value: string) {
  return new Date(value).toISOString()
}
