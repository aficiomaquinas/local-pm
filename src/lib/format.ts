const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function ordinal(day: number): string {
  const mod100 = day % 100
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`
  switch (day % 10) {
    case 1:
      return `${day}st`
    case 2:
      return `${day}nd`
    case 3:
      return `${day}rd`
    default:
      return `${day}th`
  }
}

export function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function time(date: Date): string {
  return `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`
}

export function formatDate(value: string | number | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  return `${ordinal(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  return `${formatDate(date)}, ${time(date)}`
}

export function formatDateShort(value: string | number | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  return `${ordinal(date.getDate())} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`
}

export function formatDateCompact(value: string | number | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  const sameYear = date.getFullYear() === new Date().getFullYear()
  const stem = `${ordinal(date.getDate())} ${MONTHS_SHORT[date.getMonth()]}`
  return sameYear ? stem : `${stem} ${date.getFullYear()}`
}

export function formatDateRange(
  from: string | number | Date | null | undefined,
  to: string | number | Date | null | undefined,
): string {
  const start = toDate(from)
  const end = toDate(to)
  if (!start || !end) return '—'

  const sameYear = start.getUTCFullYear() === end.getUTCFullYear()
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth()
  const head = sameMonth
    ? `${ordinal(start.getUTCDate())}`
    : `${ordinal(start.getUTCDate())} ${MONTHS_SHORT[start.getUTCMonth()]}`
  const tail = `${ordinal(end.getUTCDate())} ${MONTHS_SHORT[end.getUTCMonth()]}`

  return sameYear
    ? `${head} – ${tail} ${end.getUTCFullYear()}`
    : `${head} ${start.getUTCFullYear()} – ${tail} ${end.getUTCFullYear()}`
}

export function formatDateTimeRelative(value: string | number | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const days = Math.floor((startOfToday.getTime() - date.getTime()) / 86_400_000)

  if (days < 0) return `${formatDate(date)}, ${time(date)}`
  if (days === 0) return `Today, ${time(date)}`
  if (days === 1) return `Yesterday, ${time(date)}`
  return `${formatDate(date)}, ${time(date)}`
}
