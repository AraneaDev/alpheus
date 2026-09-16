import type { MiasmaItem } from '../scanner/types.ts'

/**
 * The confidence at or above which Alpheus will act without a human looking.
 *
 * Chosen so that an unambiguous debug statement is acted on and a judgement
 * call is not. A finding below this is still reported, just not purged.
 */
export const DEFAULT_MIN_CONFIDENCE = 0.8

/**
 * Splits findings into those worth acting on unattended and those worth showing.
 *
 * @param items - Findings to split.
 * @param min - The inclusive confidence threshold.
 * @returns The actionable findings and the ones needing review.
 */
export function partitionByConfidence(
  items: MiasmaItem[],
  min: number,
): { actionable: MiasmaItem[]; review: MiasmaItem[] } {
  const actionable: MiasmaItem[] = []
  const review: MiasmaItem[] = []

  for (const item of items) {
    if (item.confidence >= min) {
      actionable.push(item)
    } else {
      review.push(item)
    }
  }

  return { actionable, review }
}

/**
 * Reads a --min-confidence override out of the argument list.
 *
 * Accepts both `--min-confidence 0.5` and `--min-confidence=0.5`. Anything that
 * is not a finite number in [0, 1] falls back to the default rather than
 * failing, because a typo in a flag should not turn the threshold off.
 *
 * @param args - CLI arguments.
 * @returns The threshold to use.
 */
export function parseMinConfidence(args: string[]): number {
  let raw: string | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg.startsWith('--min-confidence=')) {
      raw = arg.slice('--min-confidence='.length)
      break
    }

    if (arg === '--min-confidence') {
      const next = args[i + 1]
      // Number('') is 0, so a bare --min-confidence with nothing after it would
      // otherwise mean "act on everything".
      raw = next === undefined || next === '' || next.startsWith('-') ? undefined : next
      break
    }
  }

  if (raw === undefined) return DEFAULT_MIN_CONFIDENCE

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return DEFAULT_MIN_CONFIDENCE

  return parsed
}
