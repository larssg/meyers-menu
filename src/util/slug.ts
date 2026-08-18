/** Port of Meyers.Core.Utilities.SlugHelper. */
export function generateSlug(name: string): string {
  if (!name || !name.trim()) return ''

  return name
    .toLowerCase()
    .replaceAll('ø', 'oe')
    .replaceAll('å', 'aa')
    .replaceAll('æ', 'ae')
    .replaceAll('é', 'e')
    .replaceAll('ü', 'u')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}
