/**
 * Worker entrypoint. Replaces Program.cs, CalendarEndpointHandler and
 * MenuCacheBackgroundService.
 */
import { Hono } from 'hono';
import { generateCalendar } from './ical';
import { decodeCustomConfig } from './config';
import { addMonths, copenhagenDate, dayOfWeek } from './time';
import {
  emptyStore,
  findTypeById,
  findTypeBySlug,
  readStore,
  refreshStore,
  toMenuDays,
} from './store';
import { Layout } from './views/layout';
import { Home } from './views/home';
import type { MenuEntry, MenuStore } from './types';

export interface Env {
  MENU_KV: KVNamespace;
  ASSETS: Fetcher;
  SITE_URL?: string;
  REFRESH_SECRET?: string;
}

const app = new Hono<{ Bindings: Env }>();

/** Refresh cadence the cron runs at; drives the Cache-Control math below. */
const REFRESH_INTERVAL_SECONDS = 6 * 60 * 60;
const MIN_CACHE_SECONDS = 5 * 60;

/** Keep non-content endpoints out of search indexes. Port of the Program.cs middleware. */
app.use('*', async (c, next) => {
  await next();
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/admin') || path.startsWith('/api') || path.startsWith('/calendar')) {
    c.res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
});

function baseUrl(c: { req: { url: string } }, env: Env): string {
  return env.SITE_URL ?? new URL(c.req.url).origin;
}

async function loadStore(env: Env): Promise<MenuStore> {
  return (await readStore(env.MENU_KV)) ?? emptyStore();
}

/**
 * Port of CalendarEndpointHandler.CalculateCacheDuration: expire just after the
 * next scheduled refresh, clamped to [5 minutes, 6 hours].
 */
function calculateCacheDuration(lastModified: Date, now: Date): number {
  if (lastModified > now) return MIN_CACHE_SECONDS;

  const proactiveThreshold = REFRESH_INTERVAL_SECONDS * 0.9;
  const bufferSeconds = 10 * 60;
  const expirySeconds =
    (lastModified.getTime() - now.getTime()) / 1000 + proactiveThreshold + bufferSeconds;

  return Math.min(REFRESH_INTERVAL_SECONDS, Math.max(MIN_CACHE_SECONDS, Math.floor(expirySeconds)));
}

/** Uppercase hex, first 16 chars, matching the C# Convert.ToHexString(SHA256)[..16]. */
async function contentEtag(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `"${hex.slice(0, 16)}"`;
}

/**
 * Wraps generated iCal in the caching headers the old handler set.
 *
 * Unlike the ASP.NET version this also honours If-None-Match and answers 304.
 * Calendar clients poll these feeds on a timer, so most of that traffic is
 * unchanged content.
 */
async function calendarResponse(
  content: string,
  lastModified: Date,
  now: Date,
  ifNoneMatch: string | undefined,
): Promise<Response> {
  const etag = await contentEtag(content);
  const headers = new Headers({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Cache-Control': `public, max-age=${calculateCacheDuration(lastModified, now)}`,
    ETag: etag,
    'Last-Modified': lastModified.toUTCString(),
    Vary: 'Accept-Encoding',
  });

  if (ifNoneMatch && ifNoneMatch.split(',').some((tag) => tag.trim() === etag)) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(content, { headers });
}

/** Entries inside the servable window, oldest first. */
function windowedEntries(store: MenuStore, today: string): MenuEntry[] {
  const start = addMonths(today, -1);
  const end = addMonths(today, 1);
  return store.entries
    .filter((e) => e.date >= start && e.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.menuTypeId - b.menuTypeId);
}

app.get('/', async (c) => {
  const now = new Date();
  const store = await loadStore(c.env);
  const today = copenhagenDate(now);
  const url = baseUrl(c, c.env);

  const { body, script } = Home({ store, today, now });

  return c.html(
    Layout({
      children: body,
      canonicalUrl: `${url}/`,
      baseUrl: url,
      menuDataScript: script,
    }),
  );
});

app.get('/calendar/custom/:config{.+\\.ics}', async (c) => {
  const now = new Date();
  const config = c.req.param('config').replace(/\.ics$/, '');

  const weekdayConfig = decodeCustomConfig(config);
  if (!weekdayConfig) return c.text('Invalid calendar configuration', 400);

  const store = await loadStore(c.env);
  const today = copenhagenDate(now);

  // One entry per weekday, taken from that weekday's configured menu type.
  const selected = windowedEntries(store, today).filter(
    (entry) => weekdayConfig.get(dayOfWeek(entry.date)) === entry.menuTypeId,
  );

  const content = generateCalendar(toMenuDays(store, selected), {
    menuTypeName: 'Custom Menu Selection',
    includeAlarms: c.req.query('alarm') === 'true',
    now,
    today,
  });

  return calendarResponse(content, new Date(store.updatedAt), now, c.req.header('If-None-Match'));
});

app.get('/calendar/:slug{.+\\.ics}', async (c) => {
  const now = new Date();
  const slug = c.req.param('slug').replace(/\.ics$/, '');

  const store = await loadStore(c.env);
  const menuType = findTypeBySlug(store, slug);
  if (!menuType) return c.text(`Menu '${slug}' not found`, 404);

  const today = copenhagenDate(now);
  const selected = windowedEntries(store, today).filter((e) => e.menuTypeId === menuType.id);

  const content = generateCalendar(toMenuDays(store, selected), {
    menuTypeName: menuType.name,
    includeAlarms: c.req.query('alarm') === 'true',
    now,
    today,
  });

  return calendarResponse(content, new Date(store.updatedAt), now, c.req.header('If-None-Match'));
});

app.get('/api/menu-types', async (c) => {
  const store = await loadStore(c.env);
  return c.json(
    store.menuTypes
      .filter((t) => t.isActive)
      .map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
  );
});

app.get('/robots.txt', (c) => {
  const url = baseUrl(c, c.env);
  const content = `User-agent: *
Disallow: /admin
Disallow: /api
Disallow: /calendar

# AI training crawlers
User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: Claude-Web
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: Google-Extended
Disallow: /

Sitemap: ${url}/sitemap.xml`;

  return c.text(content);
});

app.get('/sitemap.xml', async (c) => {
  const url = baseUrl(c, c.env);
  const store = await loadStore(c.env);
  const lastMod =
    store.entries.length > 0 ? `\n        <lastmod>${store.updatedAt.slice(0, 10)}</lastmod>` : '';

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>${url}/</loc>${lastMod}
        <changefreq>daily</changefreq>
    </url>
</urlset>`;

  return c.body(content, 200, { 'Content-Type': 'application/xml' });
});

/** Manual refresh, kept from the old app for troubleshooting. */
app.get('/admin/refresh-menus', async (c) => {
  const expected = c.env.REFRESH_SECRET;
  if (!expected || c.req.query('secret') !== expected) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const result = await refreshStore(c.env.MENU_KV);
    return c.json({ success: true, ...result });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

app.notFound((c) => c.text('Not found', 404));

export default {
  fetch: app.fetch,

  /** Cron trigger. Replaces MenuCacheBackgroundService. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      refreshStore(env.MENU_KV).then(
        (result) => console.log('Menu refresh complete', result),
        // Rethrow so the failure shows up as a failed cron invocation rather than
        // an unhandled rejection: this is the only signal that scraping broke.
        (error: Error) => {
          console.error('Menu refresh failed', error.message);
          throw error;
        },
      ),
    );
  },
} satisfies ExportedHandler<Env>;
