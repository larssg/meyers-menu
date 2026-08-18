/** Port of Meyers.Core.Utilities.StringHelper. */
import { htmlDecode } from './html-entities'

export function capitalizeFirst(input: string): string {
  if (!input) return input
  return input.charAt(0).toUpperCase() + input.slice(1).toLowerCase()
}

export function extractMainDishFromFirstItem(firstItem: string): string {
  const colonIndex = firstItem.indexOf(':')
  if (colonIndex <= 0 || colonIndex >= firstItem.length - 1) return firstItem

  let content = firstItem.slice(colonIndex + 1).trim()
  if (content.length > 100) content = `${content.slice(0, 100).trim()}...`

  return content
}

export function formatDescription(description: string): string {
  if (!description) return description

  let formatted = htmlDecode(description)

  formatted = formatted
    .replaceAll(', Delikatesser:', '\n\nDelikatesser:')
    .replaceAll(', Dagens salater:', '\n\nDagens salater:')
    .replaceAll(', Brød:', '\n\nBrød:')
    .replaceAll(' | ', '\n')

  // Break long runs into lines after sentence ends.
  formatted = formatted.replace(/(\. )([A-ZÆØÅ])/g, '$1\n$2')
  formatted = formatted.replace(/[ ]+/g, ' ')
  formatted = formatted.replace(/^[\n ]+/, '')

  return formatted
}

/**
 * Groups "Category: item" strings by category, preserving first-seen category order.
 * A Map gives that ordering natively, which is what the C# version tracked by hand.
 */
export function formatMenuItemsGrouped(menuItems: string[]): string {
  const grouped = new Map<string, string[]>()

  for (const item of menuItems) {
    const colonIndex = item.indexOf(':')
    const [category, content] =
      colonIndex > 0
        ? [htmlDecode(item.slice(0, colonIndex).trim()), htmlDecode(item.slice(colonIndex + 1).trim())]
        : ['', htmlDecode(item)]

    const bucket = grouped.get(category)
    if (bucket) bucket.push(content)
    else grouped.set(category, [content])
  }

  const parts: string[] = []
  for (const [category, items] of grouped) {
    if (!category) parts.push(items.join('\n'))
    else if (items.length === 1) parts.push(`${category}: ${items[0]}`)
    else parts.push(`${category}:\n${items.join('\n')}`)
  }

  return parts.join('\n\n')
}
