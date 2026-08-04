export const formatLocalIsoDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const LEXIS_BUSINESS_TIME_ZONE = 'America/Vancouver'

export const businessDateParts = (
  date: Date = new Date(),
): { year: number; month: number; day: number } => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LEXIS_BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0)
  return { year: value('year'), month: value('month'), day: value('day') }
}

export const formatIsoDateParts = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

export const formatBusinessIsoDate = (date: Date = new Date()): string => {
  const { year, month, day } = businessDateParts(date)
  return formatIsoDateParts(year, month, day)
}

export const formatBusinessDateTime = (value: string | null | undefined): string => {
  const text = value?.trim() ?? ''
  if (!text) return ''

  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LEXIS_BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? ''

  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`
}
