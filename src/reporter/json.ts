import type { MiasmaItem } from '../scanner/types.ts'

/**
 * Formats an array of MiasmaItems as serialized JSON.
 *
 * @param items - Detected miasma findings.
 * @returns JSON string.
 */
export function formatJson(items: MiasmaItem[]): string {
  return JSON.stringify(items, null, 2)
}
