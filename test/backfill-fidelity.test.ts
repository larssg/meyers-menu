/**
 * Verifies that history reconstructed from the old app's .ics feeds regenerates
 * byte-identically through the new serialiser.
 *
 * The backfill has to invert a lossy transform: the feed carries the *rendered*
 * SUMMARY and DESCRIPTION, not the raw mainDish/details they came from. That only
 * round-trips if cleanupTitle and formatDescription are idempotent over their own
 * output. This test proves it on the real data instead of assuming it.
 */
import { describe, expect, it } from 'vitest'
import { generateCalendar } from '../src/ical'
import type { MenuDay } from '../src/types'

const feeds = import.meta.glob('./vps/*.ics', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const DANISH = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag']

const unescapeText = (v: string) =>
  v.replace(/\\([\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))

function parseEvents(ics: string) {
  const unfolded = ics.replace(/\r\n[ \t]/g, '')
  return [...unfolded.matchAll(/BEGIN:VEVENT\r\n(.*?)END:VEVENT\r\n/gs)].map((m) => {
    const body = m[1]!
    const field = (name: string) => {
      const f = new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, 'm').exec(body)
      return f ? unescapeText(f[1]!.replace(/\r$/, '')) : ''
    }
    const d = /^DTSTART[^:]*:(\d{8})T/m.exec(body)![1]!
    return {
      uid: field('UID'),
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      summary: field('SUMMARY'),
      description: field('DESCRIPTION'),
    }
  })
}

const normalise = (ics: string) => ics.replace(/^DTSTAMP:.*$/gm, 'DTSTAMP:X')

describe('backfill fidelity', () => {
  it('found the captured VPS feeds', () => {
    expect(Object.keys(feeds).length).toBe(7)
  })

  for (const [path, ics] of Object.entries(feeds)) {
    const slug = path.replace('./vps/', '').replace('.ics', '')

    it(`regenerates ${slug} byte-identically from its own feed`, () => {
      const events = parseEvents(ics)
      expect(events.length).toBeGreaterThan(20)

      const prodId = /^PRODID:Meyers Menu Calendar - (.*)$/m.exec(ics.replace(/\r/g, ''))![1]!

      const days: MenuDay[] = events.map((ev) => ({
        dayName: DANISH[new Date(`${ev.date}T00:00:00Z`).getUTCDay()]!,
        date: ev.date,
        menuItems: [],
        mainDish: ev.summary,
        details: ev.description,
        menuType: ev.uid.replace(/^meyers-menu-\d{4}-\d{2}-\d{2}-?/, ''),
        prerendered: true,
      }))

      expect(normalise(generateCalendar(days, { menuTypeName: prodId }))).toBe(normalise(ics))
    })
  }
})
