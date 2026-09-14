import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { MiasmaItem, PurgeSummary } from '../scanner/types.ts'
import { createSafetyBackup } from './backup.ts'

/**
 * Options controlling the purge execution behavior.
 */
export interface PurgeOptions {
  dryRun?: boolean
  skipBackup?: boolean
}

/**
 * Removes identified miasma lines in-place from source files and unlinks scratch files.
 * Always captures a safety backup before applying mutations unless dryRun or skipBackup is set.
 *
 * @param cwd - Repository root directory.
 * @param items - Miasma findings to purge.
 * @param options - Mutation options (dryRun, skipBackup).
 * @returns Summary of mutated and unlinked files.
 */
export async function purgeMiasma(
  cwd: string,
  items: MiasmaItem[],
  options?: PurgeOptions,
): Promise<PurgeSummary> {
  let backupId = 'dry-run'
  let backupPath = 'none'

  if (!options?.dryRun && !options?.skipBackup) {
    const manifest = await createSafetyBackup(cwd, items)
    backupId = manifest.id
    backupPath = join('.alpheus/backups', manifest.id)
  }

  const modifiedFiles: { path: string; purgedLineCount: number }[] = []
  const unlinkedFiles: string[] = []

  // Group items by file
  const fileMap = new Map<string, MiasmaItem[]>()
  for (const item of items) {
    const list = fileMap.get(item.filePath) || []
    list.push(item)
    fileMap.set(item.filePath, list)
  }

  for (const [relPath, fileItems] of fileMap.entries()) {
    const absPath = join(cwd, relPath)
    if (!existsSync(absPath)) continue

    const isScratch = fileItems.some((i) => i.category === 'SCRATCH')

    if (isScratch) {
      if (!options?.dryRun) {
        unlinkSync(absPath)
      }
      unlinkedFiles.push(relPath)
      continue
    }

    // Line modification
    const rawContent = readFileSync(absPath, 'utf-8')
    const isCrlf = rawContent.includes('\r\n')
    const delimiter = isCrlf ? '\r\n' : '\n'
    const hadTrailingNewline = rawContent.endsWith('\n')

    const lines = rawContent.split(/\r?\n/)
    if (hadTrailingNewline && lines[lines.length - 1] === '') {
      lines.pop()
    }

    // Collect 1-indexed line numbers and sort descending
    const lineNumbers = fileItems
      .map((i) => i.lineNumber)
      .filter((ln): ln is number => typeof ln === 'number')
      .sort((a, b) => b - a)

    // Remove duplicates
    const uniqueLineNumbers = Array.from(new Set(lineNumbers))

    for (const ln of uniqueLineNumbers) {
      const idx = ln - 1
      if (idx >= 0 && idx < lines.length) {
        lines.splice(idx, 1)
      }
    }

    // Collapse consecutive blank lines (> 2 into 1)
    const collapsedLines: string[] = []
    let blankCount = 0

    for (const l of lines) {
      if (l.trim() === '') {
        blankCount++
        if (blankCount <= 1) {
          collapsedLines.push(l)
        }
      } else {
        blankCount = 0
        collapsedLines.push(l)
      }
    }

    const newContent = collapsedLines.join(delimiter) + (hadTrailingNewline ? delimiter : '')

    if (!options?.dryRun) {
      writeFileSync(absPath, newContent, 'utf-8')
    }

    modifiedFiles.push({
      path: relPath,
      purgedLineCount: uniqueLineNumbers.length,
    })
  }

  return {
    backupId,
    backupPath,
    modifiedFiles,
    unlinkedFiles,
  }
}
