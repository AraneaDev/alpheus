import type { DiffHunk, MiasmaItem } from '../scanner/types.ts'
import { scanGitDiff, scanUntrackedFiles } from '../scanner/git.ts'
import { detectLanguage } from './language.ts'
import { matchLogMiasma } from './rules/log.ts'
import { matchSuppressMiasma } from './rules/suppress.ts'
import { matchPathMiasma } from './rules/path.ts'
import { matchScratchFile } from './rules/scratch.ts'
import { matchTombstoneBlocks } from './rules/tombstone.ts'

/**
 * Evaluates diff hunks and extracts line-level and block-level miasma items.
 *
 * @param hunks - Parsed unified diff hunks.
 * @returns Array of detected miasma findings.
 */
export function evaluateHunks(hunks: DiffHunk[]): MiasmaItem[] {
  const items: MiasmaItem[] = []

  for (const hunk of hunks) {
    const lang = detectLanguage(hunk.filePath)

    // 1. Check for tombstone code blocks
    const tombstones = matchTombstoneBlocks(hunk.lines, lang)
    const tombstoneLineRanges = new Set<number>()

    for (const ts of tombstones) {
      for (let l = ts.startLine; l <= ts.endLine; l++) {
        tombstoneLineRanges.add(l)
      }

      items.push({
        id: `tombstone-${hunk.filePath}-${ts.startLine}`,
        filePath: hunk.filePath,
        lineNumber: ts.startLine,
        category: 'TOMBSTONE',
        matchedContent: ts.explanation,
        explanation: ts.explanation,
        confidence: 0.9,
      })
    }

    // 2. Check individual added lines
    for (const line of hunk.lines) {
      // Skip lines that are already part of a tombstone block
      if (tombstoneLineRanges.has(line.lineNumber)) {
        continue
      }

      // Check [LOG]
      const logMatch = matchLogMiasma(line.content, lang)
      if (logMatch) {
        items.push({
          id: `log-${hunk.filePath}-${line.lineNumber}`,
          filePath: hunk.filePath,
          lineNumber: line.lineNumber,
          category: 'LOG',
          matchedContent: line.content.trim(),
          explanation: logMatch,
          confidence: 1.0,
        })
        continue
      }

      // Check [SUPPRESS]
      const suppressMatch = matchSuppressMiasma(line.content, lang)
      if (suppressMatch) {
        items.push({
          id: `suppress-${hunk.filePath}-${line.lineNumber}`,
          filePath: hunk.filePath,
          lineNumber: line.lineNumber,
          category: 'SUPPRESS',
          matchedContent: line.content.trim(),
          explanation: suppressMatch,
          confidence: 1.0,
        })
        continue
      }

      // Check [PATH]
      const pathMatch = matchPathMiasma(line.content)
      if (pathMatch) {
        items.push({
          id: `path-${hunk.filePath}-${line.lineNumber}`,
          filePath: hunk.filePath,
          lineNumber: line.lineNumber,
          category: 'PATH',
          matchedContent: line.content.trim(),
          explanation: pathMatch,
          confidence: 0.95,
        })
      }
    }
  }

  return items
}

/**
 * Evaluates untracked files against throwaway/scratch heuristics.
 *
 * @param untrackedFiles - Relative paths of untracked files.
 * @returns Array of scratch file miasma findings.
 */
export function evaluateUntracked(untrackedFiles: string[]): MiasmaItem[] {
  const items: MiasmaItem[] = []

  for (const file of untrackedFiles) {
    const scratchMatch = matchScratchFile(file)
    if (scratchMatch) {
      items.push({
        id: `scratch-${file}`,
        filePath: file,
        category: 'SCRATCH',
        matchedContent: file,
        explanation: scratchMatch,
        confidence: 0.95,
      })
    }
  }

  return items
}

/**
 * Evaluates the full uncommitted git working tree (staged, unstaged, untracked).
 *
 * @param cwd - Working directory.
 * @returns Complete list of detected miasma findings.
 */
export async function evaluateWorkingTree(cwd: string): Promise<MiasmaItem[]> {
  const [hunks, untracked] = await Promise.all([
    scanGitDiff(cwd),
    scanUntrackedFiles(cwd),
  ])

  const hunkItems = evaluateHunks(hunks)
  const untrackedItems = evaluateUntracked(untracked)

  return [...hunkItems, ...untrackedItems]
}
