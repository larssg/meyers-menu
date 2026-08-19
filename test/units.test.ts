import { describe, expect, it } from 'vitest';
import { decodeCustomConfig, encodeCustomConfig } from '../src/config';
import { emptyStore, mergeMenuDays, SEED_MENU_TYPES } from '../src/store';
import { addDays, addMonths, copenhagenDate, dayOfWeek } from '../src/time';
import { generateSlug } from '../src/util/slug';
import { getDanishWeekday, isWeekday, parseDanishMonth } from '../src/util/danish-date';
import { capitalizeFirst, formatDescription, formatMenuItemsGrouped } from '../src/util/strings';
import { htmlDecode } from '../src/util/html-entities';
import { cleanupTitle } from '../src/ical';
import type { MenuDay } from '../src/types';

describe('custom config codec', () => {
  it('round-trips a config', () => {
    const decoded = decodeCustomConfig('M1T1W1R2F1')!;
    expect(decoded.get(1)).toBe(1);
    expect(decoded.get(4)).toBe(2);
    expect(encodeCustomConfig(decoded)).toBe('M1T1W1R2F1');
  });

  it('supports multi-digit menu type ids', () => {
    const decoded = decodeCustomConfig('M1T10W3R25F1')!;
    expect(decoded.get(2)).toBe(10);
    expect(decoded.get(4)).toBe(25);
  });

  it('rejects configs with stray characters', () => {
    expect(decodeCustomConfig('M1X9')).toBeNull();
    expect(decodeCustomConfig('hello')).toBeNull();
    expect(decodeCustomConfig('')).toBeNull();
    expect(decodeCustomConfig('M1 T2')).toBeNull();
  });

  it('accepts a partial week', () => {
    expect(decodeCustomConfig('M1F2')!.size).toBe(2);
  });
});

describe('slug generation', () => {
  it.each([
    ['Det velkendte', 'det-velkendte'],
    ['Den Grønne', 'den-groenne'],
    ['En bid grønnere', 'en-bid-groennere'],
    ['Meyers til frokost Aarhus', 'meyers-til-frokost-aarhus'],
    ['Det velkendte - Portionspakket', 'det-velkendte-portionspakket'],
    ['Industriens pension', 'industriens-pension'],
    ['', ''],
  ])('slugs %s to %s', (input, expected) => {
    expect(generateSlug(input)).toBe(expected);
  });

  it('keeps the production slugs stable for every seeded type', () => {
    // These slugs are in live subscription URLs.
    expect(SEED_MENU_TYPES.map((t) => generateSlug(t.name))).toEqual([
      'det-velkendte',
      'almanak',
      'den-groenne',
      'det-velkendte-portionspakket',
      'meyers-til-frokost-aarhus',
      'en-bid-groennere',
      'industriens-pension',
    ]);
  });
});

describe('date helpers', () => {
  it('returns a Copenhagen date', () => {
    expect(copenhagenDate(new Date('2026-08-19T21:30:00Z'))).toBe('2026-08-19');
    // 23:30 UTC is already the next day in Copenhagen (UTC+2 in summer).
    expect(copenhagenDate(new Date('2026-08-19T23:30:00Z'))).toBe('2026-08-20');
  });

  it('adds days across a month boundary', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('clamps addMonths to the last valid day', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-08-19', 1)).toBe('2026-09-19');
  });

  it('reports the weekday', () => {
    expect(dayOfWeek('2026-08-19')).toBe(3);
    expect(getDanishWeekday('2026-08-19')).toBe('Onsdag');
    expect(isWeekday('Mandag')).toBe(true);
    expect(isWeekday('Lørdag')).toBe(false);
    expect(parseDanishMonth('maj')).toBe(5);
    expect(parseDanishMonth('nope')).toBe(0);
  });
});

describe('string helpers', () => {
  it('capitalizes only the first letter', () => {
    expect(capitalizeFirst('mandag')).toBe('Mandag');
    expect(capitalizeFirst('MANDAG')).toBe('Mandag');
    expect(capitalizeFirst('')).toBe('');
  });

  it('decodes the entities the scraper actually sees', () => {
    expect(htmlDecode('Varm ret med tilbeh&#248;r')).toBe('Varm ret med tilbehør');
    expect(htmlDecode('a &amp; b')).toBe('a & b');
    expect(htmlDecode('no entities')).toBe('no entities');
    expect(htmlDecode('&notanentity;')).toBe('&notanentity;');
  });

  it('breaks descriptions into sections', () => {
    expect(formatDescription('Ret, Delikatesser: ost')).toBe('Ret\n\nDelikatesser: ost');
    // The C# capture group is "(\. )", so the space stays on the first line.
    expect(formatDescription('En ret. Ost og brød')).toBe('En ret. \nOst og brød');
  });

  it('groups menu items by category, preserving first-seen order', () => {
    expect(formatMenuItemsGrouped(['Varm ret: A', 'Salat: B', 'Varm ret: C'])).toBe(
      'Varm ret:\nA\nC\n\nSalat: B',
    );
  });
});

describe('cleanupTitle', () => {
  it('strips boilerplate prefixes', () => {
    expect(cleanupTitle('Alm./Halal: Frikadeller')).toBe('Frikadeller');
    expect(cleanupTitle('Varm ret med tilbehør: Suppe')).toBe('Suppe');
  });

  it('keeps a prefix that has no content after it', () => {
    expect(cleanupTitle('Halal:')).toBe('Halal:');
  });

  it('only appends an ellipsis when it truncates', () => {
    const short = 'Frikadeller med kartofler';
    expect(cleanupTitle(short)).toBe(short);

    const long = 'A'.repeat(60) + ' ' + 'B'.repeat(40);
    expect(cleanupTitle(long).endsWith('...')).toBe(true);
  });

  it('drops trailing sections', () => {
    expect(cleanupTitle('Suppe, Delikatesser: ost')).toBe('Suppe');
  });
});

describe('store merging', () => {
  const day = (date: string, menuType: string): MenuDay => ({
    dayName: getDanishWeekday(date),
    date,
    menuItems: [`Varm ret: ${menuType}`],
    mainDish: menuType,
    details: '',
    menuType,
  });

  it('reuses the frozen ids for known menu types', () => {
    const store = mergeMenuDays(emptyStore(), [day('2026-08-19', 'Det velkendte')], '2026-08-19');
    expect(store.entries[0]!.menuTypeId).toBe(1);
  });

  it('allocates a fresh id for an unseen menu type without reusing gaps', () => {
    const store = mergeMenuDays(emptyStore(), [day('2026-08-19', 'Helt Ny Menu')], '2026-08-19');
    const added = store.menuTypes.find((t) => t.name === 'Helt Ny Menu')!;
    // Highest seeded id is 8, and id 4 must stay retired.
    expect(added.id).toBe(9);
    expect(added.slug).toBe('helt-ny-menu');
  });

  it('deactivates menu types missing from the scrape but keeps their ids', () => {
    const store = mergeMenuDays(emptyStore(), [day('2026-08-19', 'Almanak')], '2026-08-19');
    expect(store.menuTypes.find((t) => t.name === 'Almanak')!.isActive).toBe(true);
    expect(store.menuTypes.find((t) => t.name === 'Det velkendte')!.isActive).toBe(false);
    expect(store.menuTypes).toHaveLength(SEED_MENU_TYPES.length);
  });

  it('replaces an existing entry for the same date and type', () => {
    const first = mergeMenuDays(emptyStore(), [day('2026-08-19', 'Almanak')], '2026-08-19');
    const updated = { ...day('2026-08-19', 'Almanak'), mainDish: 'Ny ret' };
    const second = mergeMenuDays(first, [updated], '2026-08-19');

    expect(second.entries).toHaveLength(1);
    expect(second.entries[0]!.mainDish).toBe('Ny ret');
  });

  it('prunes entries outside the retention window', () => {
    const old = mergeMenuDays(emptyStore(), [day('2026-05-19', 'Almanak')], '2026-05-19');
    expect(old.entries).toHaveLength(1);

    const later = mergeMenuDays(old, [day('2026-08-19', 'Almanak')], '2026-08-19');
    expect(later.entries.map((e) => e.date)).toEqual(['2026-08-19']);
  });

  it('sorts entries by date then menu type', () => {
    const store = mergeMenuDays(
      emptyStore(),
      [day('2026-08-20', 'Almanak'), day('2026-08-19', 'Den Grønne'), day('2026-08-19', 'Almanak')],
      '2026-08-19',
    );
    expect(store.entries.map((e) => `${e.date}:${e.menuTypeId}`)).toEqual([
      '2026-08-19:2',
      '2026-08-19:3',
      '2026-08-20:2',
    ]);
  });
});
