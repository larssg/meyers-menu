/** A single day's menu for one menu type. Port of Meyers.Core.Models.MenuDay. */
export interface MenuDay {
  /** Danish weekday name, e.g. "Mandag". */
  dayName: string
  /** Calendar date as "YYYY-MM-DD". Dates are Copenhagen-local, never UTC instants. */
  date: string
  menuItems: string[]
  mainDish: string
  details: string
  /** Menu type *name* as it appears on meyers.dk, e.g. "Det velkendte". */
  menuType: string
}

/** Port of Meyers.Core.Models.MenuType. Ids are stable and must never be renumbered. */
export interface MenuType {
  id: number
  name: string
  slug: string
  isActive: boolean
}

/**
 * The entire persisted dataset, stored as one JSON value in KV.
 *
 * Replaces the four EF DbSets. Written only by the cron trigger and the manual
 * refresh route, so read-modify-write needs no locking.
 */
export interface MenuStore {
  /** ISO instant of the last successful scrape. Drives Last-Modified and sitemap lastmod. */
  updatedAt: string
  menuTypes: MenuType[]
  /** Rolling window of today-1month .. today+1month, sorted by date then menuTypeId. */
  entries: MenuEntry[]
}

export interface MenuEntry {
  /** "YYYY-MM-DD" */
  date: string
  dayName: string
  menuTypeId: number
  menuItems: string[]
  mainDish: string
  details: string
}
