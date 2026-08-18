/**
 * Plain calendar-date helpers, all Copenhagen-local.
 *
 * Port of Meyers.Infrastructure.Services.TimeZoneService. Dates are "YYYY-MM-DD"
 * strings rather than instants, which sidesteps every DST edge case: the menu for
 * a given day is a property of the calendar date, not of a moment in time.
 */

const COPENHAGEN = 'Europe/Copenhagen'

// en-CA formats as YYYY-MM-DD, which is exactly the shape we store.
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: COPENHAGEN,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today's date in Copenhagen. `now` is injectable so tests can pin it. */
export function copenhagenDate(now: Date = new Date()): string {
  return dateFormatter.format(now)
}

/** Parses "YYYY-MM-DD" to a UTC-anchored Date for arithmetic only. */
function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`)
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date)
  d.setUTCDate(d.getUTCDate() + days)
  return fromUtc(d)
}

/** Matches DateTime.AddMonths: clamps to the last valid day of the target month. */
export function addMonths(date: string, months: number): string {
  const d = toUtc(date)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return fromUtc(d)
}

/** 0 = Sunday .. 6 = Saturday, matching System.DayOfWeek. */
export function dayOfWeek(date: string): number {
  return toUtc(date).getUTCDay()
}
