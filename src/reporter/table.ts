import type { MiasmaItem } from '../scanner/types.ts'

/**
 * Formats an array of MiasmaItems into a clean, human-readable terminal table.
 *
 * @param items - Detected miasma findings.
 * @returns Formatted terminal string.
 */
export function formatTable(items: MiasmaItem[]): string {
  if (items.length === 0) {
    return 'Working tree clean. No agent miasma detected.'
  }

  const out: string[] = []
  out.push(`Alpheus — ${items.length} agent miasma ${items.length === 1 ? 'item' : 'items'} found in working tree:`)
  out.push('')

  // Group by category
  const categories = ['LOG', 'SUPPRESS', 'SCRATCH', 'TOMBSTONE', 'PATH'] as const

  for (const cat of categories) {
    const catItems = items.filter((i) => i.category === cat)
    if (catItems.length === 0) continue

    out.push(` [${cat}] (${catItems.length})`)
    for (const item of catItems) {
      const loc = item.lineNumber ? `${item.filePath}:${item.lineNumber}` : item.filePath
      out.push(`   ${loc.padEnd(35)} ${item.matchedContent} — ${item.explanation}`)
    }
    out.push('')
  }

  out.push('Run `alpheus` to interactively purge, or `alpheus clean` to batch purge with automatic backup.')
  return out.join('\n')
}
