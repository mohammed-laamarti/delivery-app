// Morocco's legal time returned to GMT on 20 September 2026. Using UTC avoids
// a browser's stale Africa/Casablanca timezone database showing the former +1.
export const MOROCCO_TIME_ZONE = 'UTC'

const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/

function isBackendLocalDateTime(value: string) {
  return localDateTimePattern.test(value) && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
}

function dateForDisplay(value: string | Date) {
  if (value instanceof Date) return { date: value, timeZone: MOROCCO_TIME_ZONE }
  if (dateOnlyPattern.test(value)) return { date: new Date(`${value}T12:00:00Z`), timeZone: MOROCCO_TIME_ZONE }
  if (isBackendLocalDateTime(value)) return { date: new Date(`${value}Z`), timeZone: 'UTC' }
  return { date: new Date(value), timeZone: MOROCCO_TIME_ZONE }
}

/** Formats timestamps from the API as Morocco wall-clock time on every device. */
export function formatMoroccoDateTime(value: string | Date, options: Intl.DateTimeFormatOptions) {
  const { date, timeZone } = dateForDisplay(value)
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '—'
  return new Intl.DateTimeFormat('fr-FR', { ...options, timeZone }).format(date)
}

/** Returns Morocco's current calendar day, regardless of the device's timezone. */
export function moroccoTodayIso(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOROCCO_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + offsetDays))
  return date.toISOString().slice(0, 10)
}

/** Sort API-local timestamps without inheriting the browser timezone. */
export function moroccoTimestamp(value: string) {
  const { date } = dateForDisplay(value)
  return date.getTime()
}

export function moroccoDateAgeInDays(value?: string) {
  if (!value || !dateOnlyPattern.test(value.slice(0, 10))) return null
  const start = Date.parse(`${value.slice(0, 10)}T00:00:00Z`)
  const end = Date.parse(`${moroccoTodayIso()}T00:00:00Z`)
  return Math.max(0, Math.floor((end - start) / 86_400_000))
}
