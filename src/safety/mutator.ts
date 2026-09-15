import { existsSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import type { AnchoredItem } from '../engine/anchor.ts'
import { anchorFindings } from '../engine/anchor.ts'
import type { BackupManifest, MiasmaItem, PurgeSummary } from '../scanner/types.ts'
import { writeFileAtomic } from './atomic.ts'
import { createSafetyBackup, finalizeSafetyBackup } from './backup.ts'
import type { LineRange, PhysicalLine } from './lines.ts'
import { joinLines, planRemoval, splitLines } from './lines.ts'

/**
 * Options controlling the purge execution behavior.
 */
export interface PurgeOptions {
  dryRun?: boolean
  skipBackup?: boolean
}

/**
 * Throws unless the surviving lines are exactly the original lines minus the
 * given line numbers, in their original order.
 *
 * This is the invariant the whole safety story rests on, and it checks exact
 * equality rather than a tolerance band: `remaining` must equal `original`
 * with precisely `removedLineNumbers` taken out, no more and no fewer. An
 * earlier version budgeted "one extra line per range" to account for the
 * local blank-line tidy, which let an unrelated line vanish anywhere in the
 * file without tripping the check. Consuming the same removed-line set that
 * {@link planRemoval} used to build `remaining` closes that gap: the tidy's
 * drop is already counted, so there is no budget left to hide a real loss.
 *
 * @param original - The file's lines before removal.
 * @param remaining - The file's lines after removal.
 * @param removedLineNumbers - The exact original line numbers that were removed.
 */
export function assertOnlyRangesRemoved(
  original: PhysicalLine[],
  remaining: PhysicalLine[],
  removedLineNumbers: Set<number>,
): void {
  const expected = original.filter((_, idx) => !removedLineNumbers.has(idx + 1))

  if (remaining.length !== expected.length) {
    throw new Error(
      `Alpheus refused to write: expected exactly ${expected.length} lines, got ${remaining.length}`,
    )
  }

  for (let i = 0; i < expected.length; i++) {
    if (expected[i].content !== remaining[i].content || expected[i].terminator !== remaining[i].terminator) {
      throw new Error(
        'Alpheus refused to write: surviving lines are not exactly the original minus the removed lines',
      )
    }
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
  // 'dry-run' is a true label only for an actual --dry-run invocation. A real
  // run that skips or has nothing to back up gets '', not that label, so
  // reading backupId never reports a dry run that didn't happen.
  let backupId = options?.dryRun ? 'dry-run' : ''
  // Empty, not a placeholder word, so no caller can print a path for a
  // backup that was never created (dry run, skipBackup, or nothing anchored).
  let backupPath = ''

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
    const ranges: LineRange[] = fileEntries.map((e) => ({
      startLine: e.resolvedSpan.startLine,
      endLine: e.resolvedSpan.endLine,
    }))

    const { remaining, removedLineNumbers } = planRemoval(original, ranges)
    const newContent = joinLines(remaining)

    assertOnlyRangesRemoved(original, remaining, removedLineNumbers)

    if (!options?.dryRun) {
      writeFileAtomic(absPath, newContent)
    }

    modifiedFiles.push({ path: relPath, purgedLineCount: removedLineNumbers.size })
  }

  if (!options?.dryRun && manifest) {
    finalizeSafetyBackup(cwd, manifest)
  }

  return { backupId, backupPath, modifiedFiles, unlinkedFiles, unverifiable: unverifiableReport }
}
