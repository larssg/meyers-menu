# CLAUDE.md

Guidance for Claude Code working in this repository. Keep this file and README.md
up to date as the project evolves.

## Project

Cloudflare Worker that scrapes Meyers Kantiner lunch menus and serves iCal feeds.
TypeScript rewrite of a .NET 10 Blazor SSR app; see README.md for the layout.

## Commands

```bash
npm run dev          # wrangler dev
npm test             # vitest inside workerd (67 tests)
npm run typecheck
npm run css:build    # Tailwind v4 -> public/css/app.css
npm run deploy
```

## Hard constraints

- **Never change event UIDs** (`eventUid` in `src/ical.ts`). Subscribers key off them;
  a change gives everyone duplicate events.
- **Never renumber menu type ids** (`SEED_MENU_TYPES` in `src/store.ts`). Custom calendar
  URLs encode them. Id 4 is retired and stays unused.
- **Never change the iCal output format** without updating `test/oracle/` deliberately.
  The parity tests diff against the original C# implementation byte for byte.
- Get "today" from `copenhagenDate()` in `src/time.ts`, never `new Date()` inline. Dates
  are `YYYY-MM-DD` strings, not instants.
- A scrape returning zero menu days must never overwrite stored data.
- Entries with `prerendered: true` hold already-rendered SUMMARY/DESCRIPTION recovered
  from the old .NET app. Never run them through `cleanupTitle` or `formatDescription`;
  `formatDescription` is not idempotent and will corrupt them.
- The weekly preview in `src/views/home.tsx` is server-rendered for crawlers and
  re-rendered by `public/js/menu-app.js`. Both must emit the same markup.

## Formatting

Prettier, semicolons on. `npm run format` to apply, `npm run format:check` in CI.

`embeddedLanguageFormatting` is **off** on purpose: Prettier otherwise reflows the
` html` `` template in `src/views/layout.tsx` as HTML, which changes the bytes served
and the markup `menu-app.js` re-renders against. Do not turn it on.

`.prettierignore` covers `test/golden`, `test/oracle`, `test/vps`, `test/__snapshots__`
and `test/fixtures`. Those are byte-exact oracles; formatting them breaks the parity,
folding and backfill-fidelity tests.

## Conventions

- Views are Hono JSX in `src/views/`. `Layout` uses the `html` tagged template; use
  `raw()` for anything that must not be escaped.
- Only the FoodOp `__NUXT_DATA__` format is parsed. The legacy Sanity `menuBlock` format
  was dropped in the rewrite.
- Tailwind v4 config lives in `styles/app.css`. New source directories need an `@source`
  directive there or their classes get purged.
