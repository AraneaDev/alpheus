import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { MiasmaItem, SourceSpan, UnverifiableReason } from '../scanner/types.ts'

/**
 * Why a finding could not be resolved against the working tree.
 *
 * Re-exported from `scanner/types.ts`, which owns the definition: that is the
 * base layer `PurgeSummary` lives in, and `engine` is not allowed to be
 * imported from there.
 */
export type { UnverifiableReason }

/**
 * A finding whose text was located in the working tree, with its true position.
 */
export interface AnchoredItem {
  item: MiasmaItem
  resolvedSpan: SourceSpan
}

/**
 * A finding that could not be located, and so must not be acted on.
 */
export interface UnverifiableItem {
  item: MiasmaItem
  reason: UnverifiableReason
}

/**
 * The outcome of resolving a set of findings against the working tree.
 */
export interface AnchorResult {
  anchored: AnchoredItem[]
  unverifiable: UnverifiableItem[]
}

/**
 * Finds every position at which a span's lines occur consecutively in a file.
 *
 * @param fileLines - The file's lines, without terminators.
 * @param spanLines - The exact lines to locate.
 * @returns 0-indexed start positions of every consecutive match.
 */
function findMatches(fileLines: string[], spanLines: string[]): number[] {
  const matches: number[] = []
  const last = fileLines.length - spanLines.length

  for (let i = 0; i <= last; i++) {
    let hit = true

    for (let j = 0; j < spanLines.length; j++) {
      if (fileLines[i + j] !== spanLines[j]) {
        hit = false
        break
      }
    }

    if (hit) matches.push(i)
  }

  return matches
}

/**
 * Resolves findings against the current working tree, discarding any that
 * cannot be verified.
 *
 * A finding's line numbers come from a git diff, which may describe the index
 * rather than the working tree, and may in any case be stale by the time a purge
 * runs. Nothing may be deleted on the strength of a line number alone: the
 * recorded text has to still be there, and it has to be there exactly once.
 *
 * @param cwd - Repository root directory.
 * @param items - Findings to resolve.
 * @returns The findings that resolved, and those that did not with a reason.
 */
export function anchorFindings(cwd: string, items: MiasmaItem[]): AnchorResult {
  const anchored: AnchoredItem[] = []
  const unverifiable: UnverifiableItem[] = []
  const fileCache = new Map<string, string[] | null>()
  const seen = new Set<string>()

  for (const item of items) {
    // Scratch findings address a whole file, so there is no span to anchor.
    if (!item.span) {
      if (!seen.has(item.filePath)) {
        seen.add(item.filePath)
        anchored.push({
          item,
          resolvedSpan: { startLine: 0, endLine: 0, lines: [] },
        })
      }
      continue
    }

    if (!fileCache.has(item.filePath)) {
      const absPath = join(cwd, item.filePath)
      fileCache.set(
        item.filePath,
        existsSync(absPath) ? readFileSync(absPath, 'utf-8').split(/\r\n|\r|\n/) : null,
      )
    }

    const fileLines = fileCache.get(item.filePath) ?? null

    if (fileLines === null) {
      unverifiable.push({ item, reason: 'missing-file' })
      continue
    }

    const matches = findMatches(fileLines, item.span.lines)

    if (matches.length === 0) {
      unverifiable.push({ item, reason: 'not-found' })
      continue
    }

    // More than one match and the recorded position is guesswork. Choosing the
    // nearest is exactly how the wrong duplicate gets deleted.
    if (matches.length > 1) {
      unverifiable.push({ item, reason: 'ambiguous' })
      continue
    }

    const startLine = matches[0] + 1
    const key = `${item.filePath}:${startLine}`

    if (seen.has(key)) continue
    seen.add(key)

    anchored.push({
      item,
      resolvedSpan: {
        startLine,
        endLine: startLine + item.span.lines.length - 1,
        lines: item.span.lines,
      },
    })
  }

  return { anchored, unverifiable }
}
