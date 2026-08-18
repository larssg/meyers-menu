/** Port of App.razor + MainLayout.razor: document shell, SEO head, header, footer. */
import { html, raw } from 'hono/html'
import type { Child } from 'hono/jsx'
import { GithubIcon } from './components'

export const DESCRIPTION =
  'Get the weekly Meyers lunch menu in your calendar. Free iCal feeds for all Meyers Kantiner menu types, ' +
  'with support for Google Calendar, Outlook and Apple Calendar.'

const FAVICON =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>" +
  "<circle cx='50' cy='50' r='48' fill='%23a93b28'/>" +
  "<text x='50' y='70' font-size='58' font-family='Georgia,serif' font-style='italic' " +
  "fill='%23fdfaf1' text-anchor='middle'>M</text></svg>"

function structuredData(baseUrl: string): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Meyers Menu Calendar',
    description: DESCRIPTION,
    url: `${baseUrl}/`,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'DKK' },
  })
}

export function Layout(props: {
  children: Child
  canonicalUrl: string
  baseUrl: string
  /** Serialised window.menuData, injected before menu-app.js runs. */
  menuDataScript?: string
}) {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <base href="/"/>
    <link rel="preconnect" href="https://fonts.googleapis.com"/>
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"/>
    <link href="/css/app.css" rel="stylesheet"/>
    <link rel="icon" href="${raw(FAVICON)}"/>
    <script src="/js/menu-app.js" defer></script>
    <title>Meyers Menu Calendar &ndash; Meyers lunch menus as iCal calendar feeds</title>
    <meta name="description" content="${DESCRIPTION}">
    <link rel="canonical" href="${props.canonicalUrl}">

    <meta property="og:title" content="Meyers Menu Calendar">
    <meta property="og:description" content="${DESCRIPTION}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Meyers Menu Calendar">
    <meta property="og:url" content="${props.canonicalUrl}">

    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="Meyers Menu Calendar">
    <meta name="twitter:description" content="${DESCRIPTION}">

    <script type="application/ld+json">${raw(structuredData(props.baseUrl))}</script>
</head>
<body class="bg-app text-ink antialiased">
${raw(renderShell(props.children))}
${props.menuDataScript ? raw(props.menuDataScript) : ''}
</body>
</html>
`
}

/** Header, main and footer chrome. Kept separate so the JSX tree stays readable. */
function renderShell(children: Child): string {
  const shell = (
    <div class="min-h-screen bg-app flex flex-col">
      <div class="h-1 bg-madder"></div>

      <header class="pt-10 pb-2">
        <div class="container mx-auto px-4 max-w-3xl relative">
          <div class="absolute right-4 top-0 hidden sm:flex items-center gap-1">
            <a
              href="https://github.com/larssg/meyers-menu"
              target="_blank"
              class="btn-ghost"
              title="Built by Lars Sehested"
              aria-label="GitHub"
            >
              <GithubIcon class="w-4 h-4" />
            </a>
          </div>

          <a href="/" class="block text-center group">
            <p class="kicker">Man &ndash; Fre &middot; Frokost &middot; K&oslash;benhavn</p>
            <h1 class="mt-3 font-display text-4xl md:text-5xl font-semibold tracking-tight text-ink group-hover:text-madder-deep transition-colors">
              Meyers Menu Calendar
            </h1>
            <p class="mt-2 font-display italic text-ink-soft">
              Fresh lunch menus, delivered to your calendar
            </p>
          </a>
          <div class="scotch-rule mt-8"></div>
        </div>
      </header>

      <main class="container mx-auto px-4 py-10 flex-1 w-full">{children}</main>

      <footer class="mt-12 pb-12">
        <div class="container mx-auto px-4 max-w-3xl">
          <div class="border-t border-rule pt-8 text-center space-y-3">
            <p class="font-display italic text-ink-soft">Velbekomme.</p>
            <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
              Built by Lars Sehested &middot; Not affiliated with Meyers Kantiner
            </p>
            <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
              Open-source friendly &middot; Feedback welcome
            </p>
            <a
              href="https://github.com/larssg/meyers-menu"
              target="_blank"
              class="inline-block text-ink-faint hover:text-ink transition-colors"
              title="View my GitHub"
              aria-label="GitHub"
            >
              <GithubIcon class="w-5 h-5" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  )

  return shell.toString()
}
