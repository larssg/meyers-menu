/**
 * Snapshots the rendered homepage.
 *
 * The weekly preview is server-rendered for crawlers and re-rendered client side
 * by public/js/menu-app.js, which matches on class names and element structure.
 * A surprise change here means the two renderers have drifted apart.
 */
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import { generateCalendar } from '../src/ical';
import { seedFixtureStore, toMenuDaysForTest } from './helpers';
import type { Env } from '../src/index';

const testEnv = env as Env;

/**
 * The page legitimately changes every day: preview dates, the menuData payload and
 * the "last updated" line all move. Blanking them leaves the markup, which is what
 * this snapshot is guarding.
 */
function normaliseDates(html: string): string {
  return html
    .replace(
      /<script>window\.menuData = .*?<\/script>/s,
      '<script>window.menuData = {MENUDATA};</script>',
    )
    .replace(/\d{4}-\d{2}-\d{2}/g, 'YYYY-MM-DD')
    .replace(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}/g, 'DDD D MMM')
    .replace(/Menu updated [^<]*/g, 'Menu updated NORMALISED')
    .replace(/(title="|">)([^"<]*?)(?=("|<\/span>))/g, (m) => m);
}

describe('homepage render', () => {
  it('matches the committed markup snapshot', async () => {
    await seedFixtureStore(testEnv.MENU_KV);

    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request('https://menu.smartcode.dk/'), testEnv, ctx);
    await waitOnExecutionContext(ctx);

    await expect(normaliseDates(await res.text())).toMatchFileSnapshot('./__snapshots__/home.html');
  });
});

describe('cpu budget', () => {
  it('generates a full feed well inside the free-plan 10ms limit', async () => {
    const { store } = await seedFixtureStore(testEnv.MENU_KV);
    const all = toMenuDaysForTest(store);

    const t0 = performance.now();
    for (let i = 0; i < 20; i++) generateCalendar(all, { menuTypeName: 'Custom Menu Selection' });
    const perCall = (performance.now() - t0) / 20;

    expect(all.length).toBeGreaterThan(20);
    expect(perCall).toBeLessThan(5);
  });
});
