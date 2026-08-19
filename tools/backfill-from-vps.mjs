/**
 * One-off backfill: recovers calendar history from the retiring .NET app.
 *
 * The old app is the last copy of ~1 month of menu history, and it has no data
 * export. Its .ics feeds do contain everything though, so this reads them back,
 * reconstructs store entries, and merges them under the fresh scraped data
 * (which has full fidelity and always wins).
 *
 * Usage:
 *   node tools/backfill-from-vps.mjs <vps-ip> [--write]
 *
 * Without --write it prints what it would do and leaves KV untouched.
 */
import { execFileSync } from 'node:child_process'

const VPS_IP = process.argv[2]
const WRITE = process.argv.includes('--write')
const HOST = 'menu.smartcode.dk'
const STORE_KEY = 'menu-store:v1'
const KV_ID = 'cb6a9971ee9444059617f78be764669e'

if (!VPS_IP) {
  console.error('usage: node tools/backfill-from-vps.mjs <vps-ip> [--write]')
  process.exit(1)
}

/** Reads a feed straight off the origin, bypassing the DNS that now points at the Worker. */
function fetchFromVps(path) {
  return execFileSync(
    'curl',
    ['-sS', '--max-time', '30', '--resolve', `${HOST}:443:${VPS_IP}`, `https://${HOST}${path}`],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
}

const unescapeText = (v) =>
  v.replace(/\\([\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c))

/** Unfolds continuation lines, then pulls the fields we need out of each VEVENT. */
function parseEvents(ics) {
  const unfolded = ics.replace(/\r\n[ \t]/g, '')
  const events = []

  for (const block of unfolded.matchAll(/BEGIN:VEVENT\r\n(.*?)END:VEVENT\r\n/gs)) {
    const body = block[1]
    const field = (name) => {
      const m = new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, 'm').exec(body)
      return m ? unescapeText(m[1].replace(/\r$/, '')) : ''
    }

    const uid = field('UID')
    const dtstart = /^DTSTART[^:]*:(\d{8})T/m.exec(body)
    if (!uid || !dtstart || uid === 'test-event') continue

    const d = dtstart[1]
    events.push({
      uid,
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      summary: field('SUMMARY'),
      description: field('DESCRIPTION'),
    })
  }

  return events
}

const DANISH_WEEKDAYS = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag']
const danishWeekday = (date) => DANISH_WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]

/** Mirrors eventUid() in src/ical.ts so UIDs map back to a menu type id. */
const uidSuffix = (name) => name.replaceAll(' ', '-').replaceAll('/', '-').toLowerCase()

function kv(args, input) {
  return execFileSync('npx', ['wrangler', 'kv', ...args], {
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
  })
}

const store = JSON.parse(kv(['key', 'get', '--remote', '--namespace-id', KV_ID, STORE_KEY]))
console.log(`current store: ${store.entries.length} entries, ${store.menuTypes.length} menu types`)

const bySuffix = new Map(store.menuTypes.map((t) => [uidSuffix(t.name), t]))
const existing = new Set(store.entries.map((e) => `${e.date}|${e.menuTypeId}`))

const recovered = []
const unmatched = new Set()

for (const type of store.menuTypes) {
  const ics = fetchFromVps(`/calendar/${type.slug}.ics`)
  const events = parseEvents(ics)
  let added = 0

  for (const ev of events) {
    const suffix = ev.uid.replace(/^meyers-menu-\d{4}-\d{2}-\d{2}-?/, '')
    const matched = bySuffix.get(suffix)
    if (!matched) {
      unmatched.add(suffix)
      continue
    }

    const key = `${ev.date}|${matched.id}`
    // Fresh scraped entries have full fidelity; never clobber them.
    if (existing.has(key)) continue
    existing.add(key)

    recovered.push({
      date: ev.date,
      dayName: danishWeekday(ev.date),
      menuTypeId: matched.id,
      // menuItems is unrecoverable from the feed, but it is only a fallback for
      // the description, which we already have verbatim.
      menuItems: [],
      // Already-rendered SUMMARY/DESCRIPTION; see MenuDay.prerendered in src/types.ts.
      mainDish: ev.summary,
      details: ev.description,
      prerendered: true,
    })
    added++
  }

  console.log(`  ${type.slug.padEnd(32)} ${String(events.length).padStart(3)} events, ${added} recovered`)
}

if (unmatched.size) console.log(`unmatched UID suffixes: ${[...unmatched].join(', ')}`)

const merged = {
  ...store,
  entries: [...store.entries, ...recovered].sort(
    (a, b) => a.date.localeCompare(b.date) || a.menuTypeId - b.menuTypeId,
  ),
}

console.log(`\nrecovered ${recovered.length} entries -> ${merged.entries.length} total`)
console.log(`date range: ${merged.entries[0]?.date} .. ${merged.entries.at(-1)?.date}`)

if (!WRITE) {
  console.log('\ndry run, KV untouched. re-run with --write to apply.')
  process.exit(0)
}

kv(['key', 'put', '--remote', '--namespace-id', KV_ID, STORE_KEY, JSON.stringify(merged)])
console.log('\nwritten to KV.')
