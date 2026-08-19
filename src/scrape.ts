/**
 * Scrapes meyers.dk/ugens-menuer. Port of Meyers.Infrastructure.Services.MenuScrapingService.
 *
 * The page is Nuxt SSR: all data lives in a __NUXT_DATA__ script tag holding a flat
 * array where objects reference other entries by array index. Parsing is therefore
 * pointer-chasing through that array rather than HTML traversal, which is why no
 * HTML parser is needed here.
 *
 * Only the FoodOp format (live since April 2026) is implemented. The legacy
 * Sanity "menuBlock" format the C# version still carried as a fallback is gone from
 * the site and cannot come back, so it is deliberately not ported.
 */
import { getDanishWeekday } from './util/danish-date';
import { extractMainDishFromFirstItem } from './util/strings';
import type { MenuDay } from './types';

export const MENU_URL = 'https://meyers.dk/ugens-menuer';

const NUXT_DATA_RE = /<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)<\/script>/s;
const ALLERGEN_RE = /\([^)]*\)\s*/g;
const WHITESPACE_RE = /\s+/g;
const DIET_PREFIX_RE =
  /^(Alm\.?\s*\/?\s*(halal)?\s*:?|Vegetarisk(\/vegansk)?|Vegansk|Halal)\s*:?\s*/i;

type NuxtData = unknown[];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Follows an index reference into the flat array, if it is in range. */
function deref(data: NuxtData, ref: unknown): unknown {
  if (typeof ref !== 'number' || !Number.isInteger(ref) || ref < 0 || ref >= data.length)
    return undefined;
  return data[ref];
}

/**
 * Reads a string property that may be either inline or an index reference.
 * Port of MenuScrapingService.ResolveString.
 */
function resolveString(
  data: NuxtData,
  obj: Record<string, unknown>,
  property: string,
): string | null {
  const prop = obj[property];
  if (prop === undefined) return null;

  if (typeof prop === 'number') {
    const target = deref(data, prop);
    return typeof target === 'string' ? target : null;
  }

  return typeof prop === 'string' ? prop : null;
}

/** Strips diet/variant prefixes like "Alm./halal:" so the "." is not read as a sentence end. */
function stripDietPrefix(title: string): string {
  return title.replace(DIET_PREFIX_RE, '').trim();
}

/** Port of MenuScrapingService.ExtractMainDishAndDetails. */
function extractMainDishAndDetails(plainText: string): { mainDish: string; details: string } {
  const firstSentenceMatch = /^([^.]*\.)/.exec(plainText);

  let mainDish: string;
  let details: string;

  if (firstSentenceMatch && firstSentenceMatch[1]!.length < 150) {
    mainDish = firstSentenceMatch[1]!.trim();
    details = plainText.slice(firstSentenceMatch[0].length).trim();
  } else if (plainText.length > 100) {
    const cutPoint = plainText.lastIndexOf(' ', 100);
    if (cutPoint > 50) {
      mainDish = `${plainText.slice(0, cutPoint).trim()}...`;
      details = plainText.slice(cutPoint).trim();
    } else {
      mainDish = `${plainText.slice(0, 100)}...`;
      details = plainText.slice(100).trim();
    }
  } else {
    mainDish = plainText;
    details = '';
  }

  return {
    mainDish: mainDish.replace(ALLERGEN_RE, '').trim(),
    details: details.replace(ALLERGEN_RE, '').trim(),
  };
}

/** Extracts and parses the __NUXT_DATA__ payload, then walks it into MenuDays. */
export function parseNuxtData(html: string): MenuDay[] {
  const match = NUXT_DATA_RE.exec(html);
  if (!match) return [];

  let data: NuxtData;
  try {
    data = JSON.parse(match[1]!) as NuxtData;
  } catch {
    return [];
  }

  if (!Array.isArray(data) || data.length === 0) return [];

  return parseFoodopMenuBlocks(data);
}

/**
 * The FoodOp layout: a top-level index object carries "foodop-menu-block-*" keys.
 * Every such block holds all menu types, so only the first needs walking.
 */
function parseFoodopMenuBlocks(data: NuxtData): MenuDay[] {
  const menuDays: MenuDay[] = [];

  let blockRef: number | undefined;
  for (let i = 0; i < Math.min(data.length, 10) && blockRef === undefined; i++) {
    const candidate = data[i];
    if (!isObject(candidate)) continue;
    for (const [key, value] of Object.entries(candidate)) {
      if (!key.startsWith('foodop-menu-block-')) continue;
      if (typeof value === 'number') blockRef = value;
      break;
    }
  }

  if (blockRef === undefined) return menuDays;

  const blockArray = deref(data, blockRef);
  if (!Array.isArray(blockArray) || blockArray.length === 0) return menuDays;

  const subsidiary = deref(data, blockArray[0]);
  if (!isObject(subsidiary)) return menuDays;

  const menus = deref(data, subsidiary['menus']);
  if (!Array.isArray(menus)) return menuDays;

  const seen = new Set<string>();

  for (const menuEntryRef of menus) {
    const entry = deref(data, menuEntryRef);
    if (!isObject(entry)) continue;

    const dateStr = resolveString(data, entry, 'date');
    // Dates arrive ISO ("2026-04-09"); anything else is not a menu row.
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) continue;
    const date = dateStr.slice(0, 10);

    const namesObj = deref(data, entry['names']);
    if (!isObject(namesObj)) continue;
    const menuTypeName = resolveString(data, namesObj, 'da') ?? '';
    if (!menuTypeName) continue;

    const key = `${dateStr}|${menuTypeName}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const sections = deref(data, entry['menu_sections']);
    if (!Array.isArray(sections)) continue;

    const dayMenuItems: string[] = [];
    let mainDishContent = '';
    let detailsContent = '';

    for (const secRef of sections) {
      const section = deref(data, secRef);
      if (!isObject(section)) continue;

      const secNames = deref(data, section['names']);
      if (!isObject(secNames)) continue;
      const categoryName = resolveString(data, secNames, 'da') ?? '';

      const dishes = deref(data, section['menu_dishes']);
      if (!Array.isArray(dishes)) continue;

      for (const dishRef of dishes) {
        const dish = deref(data, dishRef);
        if (!isObject(dish)) continue;

        const dishNames = deref(data, dish['names']);
        if (!isObject(dishNames)) continue;

        const title = (resolveString(data, dishNames, 'da') ?? '')
          .replace(WHITESPACE_RE, ' ')
          .trim();
        if (!title) continue;

        dayMenuItems.push(`${categoryName}: ${title}`);

        // The "alm" variant of the hot dish is what the event title is built from.
        const lower = categoryName.toLowerCase();
        if (lower.includes('varm ret') && lower.includes('alm') && !mainDishContent) {
          const extracted = extractMainDishAndDetails(stripDietPrefix(title));
          mainDishContent = extracted.mainDish;
          detailsContent = extracted.details;
        }
      }
    }

    if (dayMenuItems.length === 0) continue;

    if (!mainDishContent) {
      mainDishContent = stripDietPrefix(extractMainDishFromFirstItem(dayMenuItems[0]!));
    }
    mainDishContent = mainDishContent
      .replace(ALLERGEN_RE, '')
      .trim()
      .replace(/[. ]+$/, '');

    menuDays.push({
      dayName: getDanishWeekday(date),
      date,
      menuItems: dayMenuItems,
      mainDish: mainDishContent,
      details: detailsContent,
      menuType: menuTypeName,
    });
  }

  return menuDays;
}

/** Fetches the live page and parses it. Throws on a non-OK response. */
export async function scrapeMenus(fetcher: typeof fetch = fetch): Promise<MenuDay[]> {
  const response = await fetcher(MENU_URL, {
    headers: { 'User-Agent': 'MeyersMenuCalendar/1.0' },
  });

  if (!response.ok) {
    throw new Error(`Scrape failed: ${response.status} ${response.statusText}`);
  }

  return parseNuxtData(await response.text());
}
