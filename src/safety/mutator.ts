import { existsSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import type { AnchoredItem } from '../engine/anchor.ts'
import { anchorFindings } from '../engine/anchor.ts'
import type { BackupManifest, MiasmaItem, PurgeSummary } from '../scanner/types.ts'
import { writeFileAtomic } from './atomic.ts'
import { createSafetyBackup } from './backup.ts'
import type { LineRange, PhysicalLine } from './lines.ts'
import { joinLines, removeRanges, splitLines } from './lines.ts'

/**
 * Options controlling the purge execution behavior.
 */
export interface PurgeOptions {
  dryRun?: boolean
  skipBackup?: boolean
}

/**
 * Throws unless the surviving lines are exactly the original lines minus the
 * removed ranges, in their original order.
 *
 * This is the invariant the whole safety story rests on. It is cheap, and it
 * turns a future regression in range handling into a loud failure rather than a
 * quiet one that eats somebody's source.
 *
 * @param original - The file's lines before removal.
 * @param remaining - The file's lines after removal.
 * @param ranges - The ranges that were asked for.
 */
function assertOnlyRangesRemoved(
  original: PhysicalLine[],
  remaining: PhysicalLine[],
  ranges: LineRange[],
): void {
  const removed = new Set<number>()

  for (const range of ranges) {
    for (let l = range.startLine; l <= range.endLine; l++) removed.add(l)
  }

  const expected = original.filter((_, idx) => !removed.has(idx + 1))

  // The local blank-line tidy may drop at most one further line per range.
  if (remaining.length < expected.length - ranges.length) {
    throw new Error(
      `Alpheus refused to write: expected at least ${expected.length - ranges.length} lines, got ${remaining.length}`,
    )
  }

  let cursor = 0
  for (const line of remaining) {
    while (cursor < expected.length && expected[cursor].content !== line.content) cursor++

    if (cursor >= expected.length) {
      throw new Error('Alpheus refused to write: surviving lines are not a subsequence of the original')
    }

    cursor++
  }
}

/**
 * Removes identified miasma lines in-place from source files and unlinks scratch files.
 * Always captures a safety backup before applying mutations unless dryRun or skipBackup is set.
 *
 * Every finding is anchored against the current working tree before anything is
 * touched, so a stale line number from a diff never causes the wrong line to be
 * deleted. Anchoring runs before the backup, so a purge that can verify nothing
 * does not leave a pointless snapshot behind.
 *
 * @param cwd - Repository root directory.
 * @param items - Miasma findings to purge.
 * @param options - Mutation options (dryRun, skipBackup).
 * @returns Summary of mutated, unlinked, and unverifiable files.
 */
export async function purgeMiasma(
  cwd: string,
  items: MiasmaItem[],
  options?: PurgeOptions,
): Promise<PurgeSummary> {
  const { anchored, unverifiable } = anchorFindings(cwd, items)

  const unverifiableReport = unverifiable.map((u) => ({
    filePath: u.item.filePath,
    startLine: u.item.span?.startLine,
    reason: u.reason,
  }))

  let manifest: BackupManifest | undefined
  let backupId = 'dry-run'
  let backupPath = 'none'

  if (!options?.dryRun && !options?.skipBackup && anchored.length > 0) {
    manifest = await createSafetyBackup(
      cwd,
      anchored.map((a) => a.item),
    )
    backupId = manifest.id
    backupPath = join('.alpheus/backups', manifest.id)
  }

  const modifiedFiles: { path: string; purgedLineCount: number }[] = []
  const unlinkedFiles: string[] = []

  const fileMap = new Map<string, AnchoredItem[]>()
  for (const entry of anchored) {
    const list = fileMap.get(entry.item.filePath) || []
    list.push(entry)
    fileMap.set(entry.item.filePath, list)
  }

  for (const [relPath, fileEntries] of fileMap.entries()) {
    const absPath = join(cwd, relPath)
    if (!existsSync(absPath)) continue

    if (fileEntries.some((e) => e.item.category === 'SCRATCH')) {
      if (!options?.dryRun) unlinkSync(absPath)
      unlinkedFiles.push(relPath)
      continue
    }

    const rawContent = readFileSync(absPath, 'utf-8')
    const original = splitLines(rawContent)
    const ranges = fileEntries.map((e) => ({
      startLine: e.resolvedSpan.startLine,
      endLine: e.resolvedSpan.endLine,
    }))

    const remaining = removeRanges(original, ranges)
    const removedCount = original.length - remaining.length
    const newContent = joinLines(remaining)

    assertOnlyRangesRemoved(original, remaining, ranges)

    if (!options?.dryRun) {
      writeFileAtomic(absPath, newContent)
    }

    modifiedFiles.push({ path: relPath, purgedLineCount: removedCount })
  }

  return { backupId, backupPath, modifiedFiles, unlinkedFiles, unverifiable: unverifiableReport }
}
