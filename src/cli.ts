#!/usr/bin/env bun
import { evaluateWorkingTree } from './engine/matcher.ts'
import { formatJson } from './reporter/json.ts'
import { formatTable } from './reporter/table.ts'
import { listBackups } from './safety/backup.ts'
import { purgeMiasma } from './safety/mutator.ts'
import { restoreBackup } from './safety/restore.ts'
import { runTui } from './tui/app.tsx'
import { DEMO_ITEMS } from './tui/demo.ts'

function printHelp(): void {
  console.log(`
Alpheus — Sweeps the agent's debris before you commit.

Usage:
  alpheus                      Launch interactive TUI to review & purge miasma
  alpheus check [flags]        Non-interactive scan; exit 1 if miasma found (for CI/hooks)
  alpheus clean [flags]        Batch purge all detected miasma with automatic backup
  alpheus restore [id]         Restore working tree from backup snapshot (default: latest)
  alpheus backups              List existing backup snapshots
  alpheus demo                 Launch interactive TUI with simulated findings
  alpheus help                 Show this help message

Flags:
  --json                       Output structured JSON (check mode)
  --quiet                      Suppress output (check mode)
  --dry-run                    Simulate changes without modifying files (clean mode)
`)
}

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

  if (command === 'check') {
    const isJson = args.includes('--json')
    const isQuiet = args.includes('--quiet')

    try {
      const items = await evaluateWorkingTree(cwd)

      if (isJson) {
        console.log(formatJson(items))
      } else if (!isQuiet) {
        console.log(formatTable(items))
      }

      return items.length === 0 ? 0 : 1
    } catch (err: unknown) {
      console.error('Alpheus check error:', err instanceof Error ? err.message : String(err))
      return 2
    }
  }

  if (command === 'clean') {
    const isDryRun = args.includes('--dry-run')

    try {
      const items = await evaluateWorkingTree(cwd)
      if (items.length === 0) {
        console.log('Working tree clean. No miasma to purge.')
        return 0
      }

      const summary = await purgeMiasma(cwd, items, { dryRun: isDryRun })

      if (isDryRun) {
        console.log(`[Dry Run] Would purge ${items.length} items across ${summary.modifiedFiles.length} files.`)
      } else {
        console.log(`Alpheus purged ${items.length} items across ${summary.modifiedFiles.length} files.`)
        if (summary.unlinkedFiles.length > 0) {
          console.log(`Deleted ${summary.unlinkedFiles.length} scratch files: ${summary.unlinkedFiles.join(', ')}`)
        }
        console.log(`Backup saved to ${summary.backupPath}. (Restore anytime via \`alpheus restore\`)`)
      }
      if (summary.unverifiable.length > 0) {
        console.log(`\nAlpheus could not verify ${summary.unverifiable.length} findings and left them alone:`)
        for (const u of summary.unverifiable) {
          const loc = u.startLine ? `${u.filePath}:${u.startLine}` : u.filePath
          const why = u.reason === 'ambiguous'
            ? 'the same text appears more than once'
            : u.reason === 'missing-file'
              ? 'the file is gone'
              : 'the text has moved or been removed'
          console.log(`  - ${loc} (${why})`)
        }
        console.log('Re-run `alpheus check` for a fresh scan.')
      }
      return 0
    } catch (err: unknown) {
      console.error('Alpheus clean error:', err instanceof Error ? err.message : String(err))
      return 2
    }
  }

  if (command === 'restore') {
    const targetId = args[1]
    try {
      const restored = await restoreBackup(cwd, targetId)
      console.log(`Successfully restored ${restored.length} files from backup:`)
      for (const f of restored) {
        console.log(`  - ${f}`)
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
      if (manifests.length === 0) {
        console.log('No backups found in .alpheus/backups/')
        return 0
      }

      console.log(`Alpheus Backups (${manifests.length} total):`)
      for (const m of manifests) {
        console.log(`  [${m.id}] ${m.timestamp} — ${m.files.length} files`)
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

  // Default: Launch TUI if in interactive terminal, otherwise fallback to check
  if (!process.stdin.isTTY) {
    const items = await evaluateWorkingTree(cwd)
    console.log(formatTable(items))
    if (items.length === 0) {
      console.log('Tip: Run `alpheus demo` to explore the interactive TUI with simulated findings.')
    }
    return items.length === 0 ? 0 : 1
  }

  return await runTui(cwd)
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2))
}
