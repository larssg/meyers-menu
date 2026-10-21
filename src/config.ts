/**
 * Custom calendar config codec. Port of CalendarEndpointHandler's
 * DecodeCustomConfig / EncodeCustomConfig.
 *
 * Format: M1T1W1R2F1 = Monday..Friday, each followed by a menu type id.
 * Multi-digit ids are supported (M1T10W3R25F1).
 */

/** Config letter to System.DayOfWeek number (0 = Sunday). */
const DAY_CHARS: Record<string, number> = { M: 1, T: 2, W: 3, R: 4, F: 5 };

export const ORDERED_DAYS: ReadonlyArray<{ char: string; dayOfWeek: number; label: string }> = [
  { char: 'M', dayOfWeek: 1, label: 'Monday' },
  { char: 'T', dayOfWeek: 2, label: 'Tuesday' },
  { char: 'W', dayOfWeek: 3, label: 'Wednesday' },
  { char: 'R', dayOfWeek: 4, label: 'Thursday' },
  { char: 'F', dayOfWeek: 5, label: 'Friday' },
];

/** Returns a dayOfWeek -> menuTypeId map, or null if the config is malformed. */
export function decodeCustomConfig(config: string): Map<number, number> | null {
  const matches = [...config.matchAll(/([MTWRF])(\d+)/g)];
  if (matches.length === 0) return null;

  // Reject anything with stray characters: the matches must cover the whole string.
  const totalMatchLength = matches.reduce((sum, m) => sum + m[0].length, 0);
  if (totalMatchLength !== config.length) return null;

  const result = new Map<number, number>();
  for (const match of matches) {
    const dayOfWeek = DAY_CHARS[match[1]!];
    const menuTypeId = Number.parseInt(match[2]!, 10);
    if (dayOfWeek === undefined || !Number.isSafeInteger(menuTypeId)) return null;
    result.set(dayOfWeek, menuTypeId);
  }

  return result.size > 0 ? result : null;
}

export function encodeCustomConfig(weekdayMenuConfig: Map<number, number>): string {
  return ORDERED_DAYS.filter((d) => weekdayMenuConfig.has(d.dayOfWeek))
    .map((d) => `${d.char}${weekdayMenuConfig.get(d.dayOfWeek)}`)
    .join('');
}

/** Default lunch slot, in minutes since midnight. Matches the original 12:00-13:00 events. */
export const DEFAULT_START_MINUTES = 12 * 60;
export const DEFAULT_END_MINUTES = 13 * 60;

/** Parses "HH:MM" (24-hour) into minutes since midnight, or null if malformed. */
export function parseTimeOfDay(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Resolves the optional ?start= and ?end= feed parameters. Either may be omitted
 * and falls back to the default. Returns null when a value is malformed or the
 * event would not end after it starts.
 */
export function decodeEventTimes(
  start: string | undefined,
  end: string | undefined,
): { startMinutes: number; endMinutes: number } | null {
  const startMinutes = start === undefined ? DEFAULT_START_MINUTES : parseTimeOfDay(start);
  const endMinutes = end === undefined ? DEFAULT_END_MINUTES : parseTimeOfDay(end);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return null;
  return { startMinutes, endMinutes };
}
