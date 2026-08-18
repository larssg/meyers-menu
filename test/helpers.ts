import { emptyStore, mergeMenuDays, toMenuDays } from '../src/store'
import { parseNuxtData } from '../src/scrape'
import { addDays, copenhagenDate, dayOfWeek } from '../src/time'
import fixtureHtml from './fixtures/meyers-menu-page-foodop.html?raw'
import type { MenuDay, MenuStore } from '../src/types'

export const STORE_KEY = 'menu-store:v1'

/** The fixture's Monday. Data runs Tue-Fri of that week. */
const FIXTURE_MONDAY = '2026-04-06'

/**
 * Seeds KV with the fixture data shifted onto the current week.
 *
 * Routes read the real Copenhagen "today" and serve a +/- 1 month window, so the
 * April 2026 fixture has to move forward. Shifting by whole weeks preserves every
 * menu's weekday, which the custom-config routing depends on.
 */
export async function seedFixtureStore(
  kv: KVNamespace,
): Promise<{ store: MenuStore; today: string; tuesday: string; thursday: string }> {
  const today = copenhagenDate()
  const currentMonday = addDays(today, -((dayOfWeek(today) + 6) % 7))
  const weeks = Math.round(
    (Date.parse(`${currentMonday}T00:00:00Z`) - Date.parse(`${FIXTURE_MONDAY}T00:00:00Z`)) /
      604800000,
  )

  const shifted: MenuDay[] = parseNuxtData(fixtureHtml).map((d) => ({
    ...d,
    date: addDays(d.date, weeks * 7),
  }))

  const store = mergeMenuDays(emptyStore(), shifted, today)
  // Pinned so the snapshot's "last updated" line stays stable.
  store.updatedAt = new Date(`${today}T06:00:00Z`).toISOString()
  await kv.put(STORE_KEY, JSON.stringify(store))

  return {
    store,
    today,
    tuesday: addDays(currentMonday, 1),
    thursday: addDays(currentMonday, 3),
  }
}

export function toMenuDaysForTest(store: MenuStore): MenuDay[] {
  return toMenuDays(store, store.entries)
}
