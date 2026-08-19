/**
 * Persistence. Replaces MenuDbContext + MenuRepository + the EF migrations.
 *
 * The whole dataset is one JSON value in KV. At a rolling two-month window over
 * seven menu types that is well under 100 KB, so there is nothing to gain from a
 * relational store. The cron trigger and the manual refresh route are the only
 * writers, so read-modify-write needs no locking.
 */
import { addMonths, copenhagenDate } from './time';
import { generateSlug } from './util/slug';
import { scrapeMenus } from './scrape';
import type { MenuDay, MenuEntry, MenuStore, MenuType } from './types';

const STORE_KEY = 'menu-store:v1';

/**
 * Production menu type ids, frozen.
 *
 * Custom calendar URLs encode these ids (M1T1W1R2F1), so a subscriber's feed
 * silently changes meaning if they are ever renumbered. Id 4 is intentionally
 * absent: it belonged to a menu type that no longer exists.
 */
export const SEED_MENU_TYPES: ReadonlyArray<{ id: number; name: string }> = [
  { id: 1, name: 'Det velkendte' },
  { id: 2, name: 'Almanak' },
  { id: 3, name: 'Den Grønne' },
  { id: 5, name: 'Det velkendte - Portionspakket' },
  { id: 6, name: 'Meyers til frokost Aarhus' },
  { id: 7, name: 'En bid grønnere' },
  { id: 8, name: 'Industriens pension' },
];

export function emptyStore(): MenuStore {
  return {
    updatedAt: new Date(0).toISOString(),
    menuTypes: SEED_MENU_TYPES.map((t) => ({
      id: t.id,
      name: t.name,
      slug: generateSlug(t.name),
      isActive: true,
    })),
    entries: [],
  };
}

export async function readStore(kv: KVNamespace): Promise<MenuStore | null> {
  return await kv.get<MenuStore>(STORE_KEY, 'json');
}

export async function writeStore(kv: KVNamespace, store: MenuStore): Promise<void> {
  await kv.put(STORE_KEY, JSON.stringify(store));
}

/** Case-insensitive name lookup, matching the C# GetOrCreateMenuTypeAsync semantics. */
function findTypeByName(types: MenuType[], name: string): MenuType | undefined {
  return types.find((t) => t.name.toLowerCase() === name.toLowerCase());
}

export function findTypeBySlug(store: MenuStore, slug: string): MenuType | undefined {
  return store.menuTypes.find((t) => t.slug === slug);
}

export function findTypeById(store: MenuStore, id: number): MenuType | undefined {
  return store.menuTypes.find((t) => t.id === id);
}

/**
 * Merges freshly scraped days into the store.
 *
 * Existing entries outside the retention window are dropped, entries for a
 * (date, menuType) pair are replaced, and unseen menu types are deactivated
 * without being deleted so their ids stay reserved.
 */
export function mergeMenuDays(store: MenuStore, menuDays: MenuDay[], today: string): MenuStore {
  const menuTypes = store.menuTypes.map((t) => ({ ...t }));
  let nextId = Math.max(0, ...menuTypes.map((t) => t.id)) + 1;

  const scrapedNames = new Set<string>();

  for (const day of menuDays) {
    scrapedNames.add(day.menuType.toLowerCase());
    if (findTypeByName(menuTypes, day.menuType)) continue;
    menuTypes.push({
      id: nextId++,
      name: day.menuType,
      slug: generateSlug(day.menuType),
      isActive: true,
    });
  }

  for (const type of menuTypes) {
    type.isActive = scrapedNames.has(type.name.toLowerCase());
  }

  // Same window the calendar handlers read from, so nothing servable is pruned.
  const windowStart = addMonths(today, -1);
  const windowEnd = addMonths(today, 1);

  const byKey = new Map<string, MenuEntry>();
  for (const entry of store.entries) {
    if (entry.date < windowStart || entry.date > windowEnd) continue;
    byKey.set(`${entry.date}|${entry.menuTypeId}`, entry);
  }

  for (const day of menuDays) {
    const type = findTypeByName(menuTypes, day.menuType);
    if (!type) continue;
    if (day.date < windowStart || day.date > windowEnd) continue;

    byKey.set(`${day.date}|${type.id}`, {
      date: day.date,
      dayName: day.dayName,
      menuTypeId: type.id,
      menuItems: day.menuItems,
      mainDish: day.mainDish,
      details: day.details,
    });
  }

  const entries = [...byKey.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.menuTypeId - b.menuTypeId,
  );

  return { updatedAt: new Date().toISOString(), menuTypes, entries };
}

export interface RefreshResult {
  menuCount: number;
  menuTypeCount: number;
  updatedAt: string;
}

/** Scrape, merge, persist. Used by both the cron trigger and /admin/refresh-menus. */
export async function refreshStore(
  kv: KVNamespace,
  options: { fetcher?: typeof fetch; now?: Date } = {},
): Promise<RefreshResult> {
  const now = options.now ?? new Date();
  const menuDays = await scrapeMenus(options.fetcher ?? fetch);

  if (menuDays.length === 0) {
    // Never overwrite good data with an empty scrape: a site-shape change would
    // otherwise silently blank every subscriber's calendar.
    throw new Error('Scrape returned no menu days; keeping previous data');
  }

  const current = (await readStore(kv)) ?? emptyStore();
  const merged = mergeMenuDays(current, menuDays, copenhagenDate(now));
  merged.updatedAt = now.toISOString();
  await writeStore(kv, merged);

  return {
    menuCount: merged.entries.length,
    menuTypeCount: merged.menuTypes.filter((t) => t.isActive).length,
    updatedAt: merged.updatedAt,
  };
}

/** Converts stored entries back to MenuDay, which is what the calendar layer takes. */
export function toMenuDays(store: MenuStore, entries: MenuEntry[]): MenuDay[] {
  return entries.map((entry) => ({
    dayName: entry.dayName,
    date: entry.date,
    menuItems: entry.menuItems,
    mainDish: entry.mainDish,
    details: entry.details,
    menuType: findTypeById(store, entry.menuTypeId)?.name ?? '',
    ...(entry.prerendered ? { prerendered: true } : {}),
  }));
}
