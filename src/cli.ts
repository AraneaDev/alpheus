#!/usr/bin/env bun
import { evaluateWorkingTree } from './engine/matcher.ts'
import { parseMinConfidence, partitionByConfidence } from './engine/threshold.ts'
import { formatJson } from './reporter/json.ts'
import { formatTable } from './reporter/table.ts'
import { listBackups } from './safety/backup.ts'
import { purgeMiasma } from './safety/mutator.ts'
import { restoreBackup } from './safety/restore.ts'
import type { UnverifiableReason } from './scanner/types.ts'
import { runTui } from './tui/app.tsx'
import { DEMO_ITEMS } from './tui/demo.ts'

/**
 * Human-readable explanation for each reason a finding could not be
 * verified against the working tree.
 *
 * Typed as `Record<UnverifiableReason, string>` rather than a chain of
 * ternaries so that adding a fourth reason without adding a line here is a
 * compile error instead of a silent fall-through to the wrong text.
 */
const UNVERIFIABLE_REASON_TEXT: Record<UnverifiableReason, string> = {
  ambiguous: 'the same text appears more than once',
  'missing-file': 'the file is gone',
  'not-found': 'the text has moved or been removed',
}

function printHelp(): void {
  console.log(`
Alpheus, sweeps the agent's debris before you commit.

Usage:
  alpheus                      Launch interactive TUI to review & purge miasma
  alpheus check [flags]        Non-interactive scan; exit 1 if miasma found (for CI/hooks)
  alpheus clean [flags]        Batch purge all detected miasma with automatic backup
  alpheus restore [id]         Restore working tree from backup snapshot (default: latest)
  alpheus backups              List existing backup snapshots
  alpheus demo                 Launch interactive TUI with simulated findings
  alpheus help                 Show this help message

Flags:
  --json                       Output structured JSON (check, clean, backups, restore)
  --quiet                      Suppress output (check mode)
  --dry-run                    Simulate changes without modifying files (clean mode)
  --force                      Restore even over files edited since the purge (restore mode)
  --min-confidence <0-1>       Confidence threshold for unattended action (default 0.8; check/clean)
`)
}

/** Commands `main` recognizes; anything else is a usage error. */
const KNOWN_COMMANDS = ['check', 'clean', 'restore', 'backups', 'demo', 'help']

/**
 * Main command-line entrypoint for Alpheus CLI.
 *
 * @param args - CLI arguments array (defaults to process.argv.slice(2)).
 * @param cwd - Repository working directory (defaults to process.cwd()).
 * @returns Exit code (0 for success, 1 for errors or detected miasma).
 */
export async function main(
  args: string[] = process.argv.slice(2),
  cwd: string = process.cwd(),
): Promise<number> {
  const command = args[0] || ''

  if (command === 'help' || args.includes('--help') || args.includes('-h')) {
    printHelp()
    return 0
  }

  if (command !== '' && !command.startsWith('-') && !KNOWN_COMMANDS.includes(command)) {
    console.error(`Unknown command: ${command}`)
    printHelp()
    return 2
  }

  const isJson = args.includes('--json')

  if (command === 'check') {
    const isQuiet = args.includes('--quiet')
    const minConfidence = parseMinConfidence(args)

    try {
      const items = await evaluateWorkingTree(cwd)
      const { actionable, review } = partitionByConfidence(items, minConfidence)

      if (isJson) {
        console.log(formatJson(items))
      } else if (!isQuiet) {
        console.log(formatTable(items))
        if (review.length > 0) {
          console.log(
            `\n${review.length} of the above sit below the confidence threshold (${minConfidence}) ` +
              'and would not fail this check or be purged by `alpheus clean`.',
          )
        }
      }

      return actionable.length === 0 ? 0 : 1
    } catch (err: unknown) {
      console.error('Alpheus check error:', err instanceof Error ? err.message : String(err))
      return 2
    }
  }

  if (command === 'clean') {
    const isDryRun = args.includes('--dry-run')
    const minConfidence = parseMinConfidence(args)

    try {
      const items = await evaluateWorkingTree(cwd)
      if (items.length === 0) {
        if (isJson) {
          console.log(JSON.stringify({ modifiedFiles: [], unlinkedFiles: [], unverifiable: [], review: [] }, null, 2))
        } else {
          console.log('Working tree clean. No miasma to purge.')
        }
        return 0
      }

      const { actionable, review } = partitionByConfidence(items, minConfidence)
      // Agrees with `check` on the same tree: an actionable finding that
      // purgeMiasma could not anchor and purge is still sitting in the
      // working tree at or above the threshold, exactly what `check` fails
      // on. Without this, a clean where every actionable finding turned out
      // unverifiable reported success (exit 0) while `check` on that same,
      // untouched tree reported findings (exit 1).
      let exitCode = 0

      if (actionable.length === 0) {
        if (isJson) {
          console.log(JSON.stringify({ modifiedFiles: [], unlinkedFiles: [], unverifiable: [], review }, null, 2))
          return 0
        }
        console.log('Nothing to purge above the confidence threshold.')
      } else {
        const summary = await purgeMiasma(cwd, actionable, { dryRun: isDryRun })
        const purgedLines = summary.modifiedFiles.reduce((n, f) => n + f.purgedLineCount, 0)

        if (summary.unverifiable.length > 0) exitCode = 1

        if (isJson) {
          console.log(JSON.stringify({ ...summary, review }, null, 2))
          return exitCode
        }

        const linesWord = purgedLines === 1 ? 'line' : 'lines'
        const filesWord = summary.modifiedFiles.length === 1 ? 'file' : 'files'

        if (isDryRun) {
          if (summary.modifiedFiles.length > 0) {
            console.log(`[Dry Run] Would purge ${purgedLines} ${linesWord} across ${summary.modifiedFiles.length} ${filesWord}.`)
          }
          if (summary.unlinkedFiles.length > 0) {
            console.log(`Would delete ${summary.unlinkedFiles.length} scratch files: ${summary.unlinkedFiles.join(', ')}`)
          }
        } else {
          if (summary.modifiedFiles.length > 0) {
            console.log(`Alpheus purged ${purgedLines} ${linesWord} across ${summary.modifiedFiles.length} ${filesWord}.`)
          }
          if (summary.unlinkedFiles.length > 0) {
            console.log(`Deleted ${summary.unlinkedFiles.length} scratch files: ${summary.unlinkedFiles.join(', ')}`)
          }
          if (summary.backupPath) {
            console.log(`Backup saved to ${summary.backupPath}. (Restore anytime via \`alpheus restore\`)`)
          } else {
            console.log('Nothing was purged; no changes were made.')
          }
        }

        if (summary.unverifiable.length > 0) {
          console.log(`\nAlpheus could not verify ${summary.unverifiable.length} findings and left them alone:`)
          for (const u of summary.unverifiable) {
            const loc = u.startLine ? `${u.filePath}:${u.startLine}` : u.filePath
            const why = UNVERIFIABLE_REASON_TEXT[u.reason]
            console.log(`  - ${loc} (${why})`)
          }
          console.log('Re-run `alpheus check` for a fresh scan.')
        }
      }

      // Printed for both the "nothing actionable" and "purge happened" paths
      // above, since a review-worthy finding can sit alongside either outcome.
      if (review.length > 0) {
        console.log(`\n${review.length} findings need review and were left alone:`)
        for (const item of review) {
          const loc = item.span ? `${item.filePath}:${item.span.startLine}` : item.filePath
          console.log(`  - [${item.category}] ${loc} (${item.explanation}, confidence ${item.confidence.toFixed(2)})`)
        }
        console.log('Run `alpheus` to review them interactively, or lower --min-confidence.')
      }

      return exitCode
    } catch (err: unknown) {
      console.error('Alpheus clean error:', err instanceof Error ? err.message : String(err))
      return 2
    }
  }

  if (command === 'restore') {
    // The id is whichever positional argument isn't a flag, so it can come
    // before or after `--force` (`restore --force <id>` or `restore <id> --force`).
    const targetId = args.slice(1).find((a) => !a.startsWith('--'))
    const force = args.includes('--force')
    try {
      const restored = await restoreBackup(cwd, targetId, { force })
      if (isJson) {
        console.log(JSON.stringify({ restored }, null, 2))
      } else {
        console.log(`Successfully restored ${restored.length} files from backup:`)
        for (const f of restored) {
          console.log(`  - ${f}`)
        }
      }
      return 0
    } catch (err: unknown) {
      console.error('Alpheus restore error:', err instanceof Error ? err.message : String(err))
      return 2
    }
  }

  if (command === 'backups') {
    try {
      const manifests = await listBackups(cwd)

      if (isJson) {
        console.log(JSON.stringify(manifests, null, 2))
        return 0
      }

      if (manifests.length === 0) {
        console.log('No backups found in .alpheus/backups/')
        return 0
      }

      console.log(`Alpheus Backups (${manifests.length} total):`)
      for (const m of manifests) {
        console.log(`  [${m.id}] ${m.timestamp}, ${m.files.length} files`)
      }
      return 0
    } catch (err: unknown) {
      console.error('Alpheus backups error:', err instanceof Error ? err.message : String(err))
      return 2
    }
  }

  if (command === 'demo' || args.includes('--demo')) {
    if (!process.stdin.isTTY) {
      console.log(formatTable(DEMO_ITEMS))
      return 0
    }
    return await runTui(cwd, undefined, DEMO_ITEMS)
  }

  // Default: Launch TUI if in interactive terminal, otherwise fallback to check.
  // Exit code follows the same rule as `alpheus check`: only findings at or
  // above the confidence threshold fail it, so the two agree on the same tree.
  if (!process.stdin.isTTY) {
    const minConfidence = parseMinConfidence(args)
    const items = await evaluateWorkingTree(cwd)
    const { actionable } = partitionByConfidence(items, minConfidence)
    console.log(formatTable(items))
    if (items.length === 0) {
      console.log('Tip: Run `alpheus demo` to explore the interactive TUI with simulated findings.')
    }
    return actionable.length === 0 ? 0 : 1
  }

  return await runTui(cwd)
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2))
}
