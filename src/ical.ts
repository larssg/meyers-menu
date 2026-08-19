/**
 * iCalendar serialiser. Port of Meyers.Infrastructure.Services.CalendarService.
 *
 * Hand-rolled rather than library-backed because the output contract is frozen:
 * existing subscribers key off the UIDs, and Ical.Net's exact property ordering,
 * 75-octet folding and escaping are reproduced here byte for byte. The golden
 * files in test/golden are the oracle for that.
 */
import { htmlDecode } from './util/html-entities'
import { formatDescription, formatMenuItemsGrouped } from './util/strings'
import type { MenuDay } from './types'

const TZID = 'Europe/Copenhagen'
const MAX_TITLE_LENGTH = 80

/** Escapes a text value per RFC 5545 3.3.11, matching Ical.Net's serialiser. */
function escapeText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replace(/\r\n|\n|\r/g, '\\n')
}

/**
 * Folds a content line to 75 octets, continuation lines prefixed with one space.
 *
 * Splits on UTF-8 byte boundaries, never mid-codepoint. Verified byte-identical
 * against every captured golden feed.
 */
export function foldLine(line: string): string[] {
  const buf = new TextEncoder().encode(line)
  if (buf.length <= 75) return [line]

  const decoder = new TextDecoder()
  const out: string[] = []
  let i = 0
  let limit = 75

  while (i < buf.length) {
    let end = Math.min(i + limit, buf.length)
    // Back off a continuation byte (10xxxxxx) so a codepoint is never split.
    while (end < buf.length && (buf[end]! & 0xc0) === 0x80) end--
    out.push((out.length ? ' ' : '') + decoder.decode(buf.subarray(i, end)))
    i = end
    limit = 74
  }

  return out
}

/** "20260720T120000" in Copenhagen local time for a "YYYY-MM-DD" date plus an hour. */
function localDateTime(date: string, hour: number): string {
  return `${date.replaceAll('-', '')}T${String(hour).padStart(2, '0')}0000`
}

/** "20260818T231406Z" */
function utcStamp(at: Date): string {
  return `${at.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`
}

/** Port of CalendarService.CleanupTitle. Only appends "..." when it truly truncates. */
export function cleanupTitle(title: string): string {
  if (!title) return title

  const cleanTitle = htmlDecode(title)

  // Keep only the main-dish section.
  const sections = cleanTitle.split(/, Delikatesser:|, Dagens salater:|, Brød:/).filter((s) => s !== '')
  let mainSection = sections[0] ?? ''

  const prefixesToRemove = [
    'Varm ret med tilbehør:',
    'Varm ret med tilbeh&#248;r:',
    'Alm./Halal:',
    'Alm.:',
    'Halal:',
  ]

  for (const prefix of prefixesToRemove) {
    if (!mainSection.toLowerCase().startsWith(prefix.toLowerCase())) continue

    const remainingContent = mainSection.slice(prefix.length).trim()
    if (remainingContent) {
      mainSection = remainingContent
      break
    }
  }

  mainSection = mainSection.trim()

  while (mainSection.startsWith(',') || mainSection.startsWith(':')) {
    mainSection = mainSection.slice(1).trim()
  }

  if (mainSection.length > MAX_TITLE_LENGTH) {
    const firstSentence = mainSection.split('.')[0] ?? ''
    if (firstSentence.length > 20 && firstSentence.length < mainSection.length) {
      const remainingAfterSentence = mainSection.slice(firstSentence.length).trim()
      mainSection = remainingAfterSentence.length > 1
        ? `${firstSentence.trim()}...`
        : firstSentence.trim()
    } else {
      const breakPoint = mainSection.lastIndexOf(' ', Math.min(MAX_TITLE_LENGTH, mainSection.length - 1))
      mainSection = breakPoint > 40
        ? `${mainSection.slice(0, breakPoint).trim()}...`
        : `${mainSection.slice(0, MAX_TITLE_LENGTH).trim()}...`
    }
  }

  return mainSection
}

/** UID must stay stable forever: changing it duplicates events for every subscriber. */
function eventUid(date: string, menuType: string): string {
  if (!menuType) return `meyers-menu-${date}`
  const suffix = menuType.replaceAll(' ', '-').replaceAll('/', '-').toLowerCase()
  return `meyers-menu-${date}-${suffix}`
}

export interface GenerateCalendarOptions {
  menuTypeName?: string
  includeAlarms?: boolean
  /** Injected so output is deterministic under test. */
  now?: Date
  /** Fallback "today" used only for the empty-menu placeholder event. */
  today?: string
}

export function generateCalendar(menuDays: MenuDay[], options: GenerateCalendarOptions = {}): string {
  const { menuTypeName, includeAlarms = false, now = new Date() } = options

  const calendarName = menuTypeName
    ? `Meyers Menu Calendar - ${menuTypeName}`
    : 'Meyers Menu Calendar'
  const dtstamp = utcStamp(now)

  // Properties are emitted in the alphabetical order Ical.Net uses.
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    `PRODID:${escapeText(calendarName)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'VERSION:2.0',
    'X-PUBLISHED-TTL:PT6H',
    'BEGIN:VTIMEZONE',
    `TZID:${TZID}`,
    `X-LIC-LOCATION:${TZID}`,
    'END:VTIMEZONE',
  ]

  const pushEvent = (uid: string, summary: string, description: string, date: string) => {
    lines.push(
      'BEGIN:VEVENT',
      `DESCRIPTION:${escapeText(description)}`,
      `DTEND;TZID=${TZID}:${localDateTime(date, 13)}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=${TZID}:${localDateTime(date, 12)}`,
      'SEQUENCE:0',
      `SUMMARY:${escapeText(summary)}`,
      `UID:${escapeText(uid)}`,
    )
    if (includeAlarms) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(summary)}`,
        'TRIGGER:-PT5M',
        'END:VALARM',
      )
    }
    lines.push('END:VEVENT')
  }

  if (menuDays.length === 0) {
    const today = options.today ?? new Date().toISOString().slice(0, 10)
    pushEvent(
      'test-event',
      'No menu found - Test Event',
      'Unable to scrape menu from Meyers website',
      today,
    )
  } else {
    for (const menuDay of menuDays) {
      // Backfilled entries already hold rendered text; rendering again corrupts it.
      const title = menuDay.prerendered
        ? menuDay.mainDish
        : menuDay.mainDish
          ? cleanupTitle(menuDay.mainDish)
          : `Meyers Menu - ${menuDay.dayName}`
      const description = menuDay.prerendered
        ? menuDay.details
        : menuDay.mainDish
          ? (menuDay.details ? formatDescription(menuDay.details) : formatMenuItemsGrouped(menuDay.menuItems))
          : formatMenuItemsGrouped(menuDay.menuItems)

      pushEvent(eventUid(menuDay.date, menuDay.menuType), title, description, menuDay.date)
    }
  }

  lines.push('END:VCALENDAR')

  return lines.flatMap(foldLine).join('\r\n') + '\r\n'
}
