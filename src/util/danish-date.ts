/** Port of Meyers.Core.Utilities.DanishDateHelper. */

const WEEKDAYS = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag'] as const

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, maj: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12,
}

export function parseDanishMonth(monthName: string): number {
  return MONTHS[monthName.toLowerCase()] ?? 0
}

export function isWeekday(dayName: string): boolean {
  return WEEKDAYS.some((w) => w.toLowerCase() === dayName.toLowerCase())
}

/**
 * Danish weekday name for a "YYYY-MM-DD" date string.
 *
 * Parsed as UTC deliberately: these are plain calendar dates, so anchoring them
 * to UTC midnight keeps getUTCDay() free of any local-timezone drift.
 */
export function getDanishWeekday(date: string): string {
  const names = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag']
  return names[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? ''
}
