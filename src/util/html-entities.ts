/**
 * Minimal stand-in for System.Net.WebUtility.HtmlDecode.
 *
 * Workers have no DOM, so there is nothing to borrow a decoder from. The scraped
 * payload only ever contains numeric entities plus the handful of named ones below,
 * which is why this table is deliberately short rather than the full HTML5 set.
 */
const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aelig: 'æ', AElig: 'Æ', oslash: 'ø', Oslash: 'Ø', aring: 'å', Aring: 'Å',
  eacute: 'é', Eacute: 'É', uuml: 'ü', Uuml: 'Ü', hellip: '…',
  ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘',
}

export function htmlDecode(input: string): string {
  if (!input || !input.includes('&')) return input

  return input.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const isHex = entity[1] === 'x' || entity[1] === 'X'
      const code = parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10)
      // Lone surrogates and out-of-range code points would throw; leave those as-is.
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match
      if (code >= 0xd800 && code <= 0xdfff) return match
      return String.fromCodePoint(code)
    }
    return NAMED[entity] ?? match
  })
}
