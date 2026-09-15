import type { MiasmaItem } from '../scanner/types.ts'

/**
 * Formats an array of MiasmaItems as serialized JSON.
 *
 * @param items - Detected miasma findings.
 * @returns JSON string.
 */
export function formatJson(items: MiasmaItem[]): string {
  return JSON.stringify(
    items.map((i) => ({
      ...i,
      lineNumber: i.span?.startLine,
      matchedContent: i.span?.lines[0]?.trim() ?? i.filePath,
    })),
    null,
    2,
  )
}
