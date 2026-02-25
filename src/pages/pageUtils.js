export function resolveLogStatus(log) {
  const text = `${log.entidade || ''} ${log.mensagem || ''}`.toLowerCase()
  const hasZeroErrorCount = /\b0+\s*(errors?|erros?|falhas?)\b/.test(text)
  const hasErrorSignal = /\b(errors?|erros?|falhas?|failed)\b/.test(text)
  if (hasErrorSignal && !hasZeroErrorCount) return 'erro'
  if (text.includes('conclu')) return 'concluido'
  if (text.includes('salv') || text.includes('upsert')) return 'salvando'
  return 'extraindo'
}

export function formatLogTime(timestamp) {
  if (!timestamp) return '--:--:--'
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) return '--:--:--'
  return parsed.toLocaleTimeString('pt-BR', { hour12: false })
}

export function toInputDate(date) {
  return date.toISOString().slice(0, 10)
}

export function daysAgo(days) {
  const value = new Date()
  value.setDate(value.getDate() - days)
  return value
}

export function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value || 0))
}

export function formatDecimal(value, digits = 2) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatCorrelation(value) {
  const parsed = Number(value)
  if (value === null || value === undefined || Number.isNaN(parsed)) {
    return 'N/A'
  }
  return parsed.toLocaleString('pt-BR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })
}

export function logUiError(page, entity, error) {
  const detail =
    error?.response?.data?.detail || error?.message || (typeof error === 'string' ? error : 'Erro desconhecido')
  console.error(`[ui-error] page=${page} entity=${entity} detail=${detail}`, {
    page,
    entity,
    detail,
  })
}

export function formatDateTime(value) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleString('pt-BR')
}

export function formatDate(value) {
  const text = String(value || '').slice(0, 10)
  const [year, month, day] = text.split('-').map((part) => Number(part))
  if (!year || !month || !day) return '-'
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

export function truncateText(value, maxLength = 100) {
  const text = String(value || '')
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}
