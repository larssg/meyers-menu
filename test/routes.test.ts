/**
 * End-to-end route tests. These run inside workerd against a real KV binding,
 * so the Worker is exercised the same way Cloudflare will run it.
 */
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index';
import { STORE_KEY, seedFixtureStore } from './helpers';
import type { Env } from '../src/index';

const testEnv = env as Env & { REFRESH_SECRET?: string };

const seed = () => seedFixtureStore(testEnv.MENU_KV);

async function get(path: string, headers: Record<string, string> = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`https://menu.smartcode.dk${path}`, { headers }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

beforeEach(async () => {
  await testEnv.MENU_KV.delete(STORE_KEY);
});

describe('GET /', () => {
  it('server-renders the weekly preview so crawlers see menu content', async () => {
    await seed();
    const res = await get('/');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('id="weeklyPreview"');
    expect(html).toContain('menu-row-today');
    expect(html).toContain('window.menuData =');
    expect(html).toContain('Meyers Menu Calendar');
  });

  it('renders without data instead of erroring', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Menu data not available');
  });

  it('carries the SEO head tags', async () => {
    await seed();
    const html = await get('/').then((r) => r.text());

    expect(html).toContain('<link rel="canonical" href="https://menu.smartcode.dk/">');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('application/ld+json');
  });

  it('is not marked noindex', async () => {
    const res = await get('/');
    expect(res.headers.get('X-Robots-Tag')).toBeNull();
  });
});

describe('GET /calendar/:slug.ics', () => {
  it('serves a feed for each active menu type', async () => {
    const { thursday } = await seed();
    const res = await get('/calendar/det-velkendte.ics');
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('PRODID:Meyers Menu Calendar - Det velkendte');
    expect(body).toContain(`UID:meyers-menu-${thursday}-det-velkendte`);
  });

  it('404s on an unknown slug', async () => {
    await seed();
    expect((await get('/calendar/nope.ics')).status).toBe(404);
  });

  it('adds alarms only when asked', async () => {
    await seed();
    expect(await get('/calendar/det-velkendte.ics').then((r) => r.text())).not.toContain('VALARM');

    const withAlarm = await get('/calendar/det-velkendte.ics?alarm=true').then((r) => r.text());
    expect(withAlarm).toContain('BEGIN:VALARM');
    expect(withAlarm).toContain('TRIGGER:-PT5M');
  });

  it('sets caching headers and answers 304 to a matching ETag', async () => {
    await seed();
    const first = await get('/calendar/det-velkendte.ics');
    const etag = first.headers.get('ETag');

    expect(etag).toMatch(/^"[0-9A-F]{16}"$/);
    expect(first.headers.get('Cache-Control')).toMatch(/^public, max-age=\d+$/);
    expect(first.headers.get('Last-Modified')).toBeTruthy();

    const second = await get('/calendar/det-velkendte.ics', { 'If-None-Match': etag! });
    expect(second.status).toBe(304);
  });

  it('is marked noindex', async () => {
    await seed();
    const res = await get('/calendar/det-velkendte.ics');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
});

describe('GET /calendar/custom/:config.ics', () => {
  it('picks the configured menu type per weekday', async () => {
    const { tuesday, thursday } = await seed();
    // Thursday (R) = 3 = Den Grønne, every other day = 1 = Det velkendte.
    const body = await get('/calendar/custom/M1T1W1R3F1.ics').then((r) => r.text());

    expect(body).toContain('PRODID:Meyers Menu Calendar - Custom Menu Selection');
    expect(body).toContain(`UID:meyers-menu-${thursday}-den-grønne`);
    expect(body).not.toContain(`UID:meyers-menu-${thursday}-det-velkendte`);
    expect(body).toContain(`UID:meyers-menu-${tuesday}-det-velkendte`);
  });

  it('rejects a malformed config', async () => {
    await seed();
    expect((await get('/calendar/custom/notaconfig.ics')).status).toBe(400);
    expect((await get('/calendar/custom/M1X9.ics')).status).toBe(400);
  });

  it('silently skips days whose menu type does not exist', async () => {
    await seed();
    const res = await get('/calendar/custom/M999.ics');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('BEGIN:VCALENDAR');
  });
});

describe('GET /api/menu-types', () => {
  it('returns the active types with their frozen ids', async () => {
    await seed();
    const types = (await get('/api/menu-types').then((r) => r.json())) as Array<{
      id: number;
      slug: string;
    }>;

    expect(types.find((t) => t.slug === 'det-velkendte')?.id).toBe(1);
    expect(types.find((t) => t.slug === 'almanak')?.id).toBe(2);
    expect(types.find((t) => t.slug === 'den-groenne')?.id).toBe(3);
  });
});

describe('SEO endpoints', () => {
  it('serves robots.txt with the sitemap reference', async () => {
    const body = await get('/robots.txt').then((r) => r.text());
    expect(body).toContain('Disallow: /admin');
    expect(body).toContain('User-agent: GPTBot');
    expect(body).toContain('Sitemap: https://menu.smartcode.dk/sitemap.xml');
  });

  it('serves sitemap.xml with lastmod once data exists', async () => {
    await seed();
    const res = await get('/sitemap.xml');
    const body = await res.text();

    expect(res.headers.get('Content-Type')).toContain('application/xml');
    expect(body).toContain('<loc>https://menu.smartcode.dk/</loc>');
    expect(body).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  it('omits lastmod when there is no data', async () => {
    expect(await get('/sitemap.xml').then((r) => r.text())).not.toContain('lastmod');
  });
});

describe('GET /admin/refresh-menus', () => {
  it('rejects a missing or wrong secret', async () => {
    expect((await get('/admin/refresh-menus')).status).toBe(401);
    expect((await get('/admin/refresh-menus?secret=wrong')).status).toBe(401);
  });
});
