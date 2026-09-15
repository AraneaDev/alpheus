import React, { useState } from 'react'
import { Box, render, Text, useApp, useInput, useWindowSize } from 'ink'
import type { MiasmaItem, PurgeSummary } from '../scanner/types.ts'
import { evaluateWorkingTree } from '../engine/matcher.ts'
import { DEFAULT_MIN_CONFIDENCE } from '../engine/threshold.ts'
import { purgeMiasma } from '../safety/mutator.ts'
import { DiffPreview } from './components/diff-preview.tsx'
import { FindingList } from './components/finding-list.tsx'
import { StatusBar } from './components/status-bar.tsx'

/**
 * Props for the interactive Alpheus Ink TUI application.
 */
export interface AppProps {
  items: MiasmaItem[]
  cwd: string
  onPurge: (selectedItems: MiasmaItem[]) => Promise<PurgeSummary>
  onDone: (exitCode: number) => void
  columns?: number
  rows?: number
}

/**
 * Main interactive Ink TUI application component for reviewing and purging miasma.
 */
export const App: React.FC<AppProps> = ({
  items,
  cwd,
  onPurge,
  onDone,
  columns: propCols,
  rows: propRows,
}) => {
  const { exit } = useApp()
  const windowSize = useWindowSize()
  const columns = propCols ?? windowSize.columns ?? 80
  const rows = propRows ?? windowSize.rows ?? 24

  const [cursorIndex, setCursorIndex] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    // Only findings Alpheus would act on unattended start ticked; anything
    // below the threshold is still shown and still selectable by hand.
    () => new Set(items.filter((i) => i.confidence >= DEFAULT_MIN_CONFIDENCE).map((i) => i.id)),
  )
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  useInput((input, key) => {
    if (isProcessing) return

    if (key.upArrow || input === 'k') {
      setCursorIndex((prev) => Math.max(0, prev - 1))
    } else if (key.downArrow || input === 'j') {
      setCursorIndex((prev) => Math.min(items.length - 1, prev + 1))
    } else if (input === ' ') {
      const currentItem = items[cursorIndex]
      if (currentItem) {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          if (next.has(currentItem.id)) {
            next.delete(currentItem.id)
          } else {
            next.add(currentItem.id)
          }
          return next
        })
      }
    } else if (input === 'a') {
      setSelectedIds((prev) => {
        if (prev.size === items.length) {
          return new Set() // Deselect all
        } else {
          return new Set(items.map((i) => i.id)) // Select all
        }
      })
    } else if (key.return) {
      const chosen = items.filter((i) => selectedIds.has(i.id))
      if (chosen.length === 0) {
        setStatusMessage('No items selected to purge.')
        return
      }

      setIsProcessing(true)
      setStatusMessage('Creating backup and purging selected items...')

      onPurge(chosen)
        .then((summary) => {
          const skipped = summary.unverifiable.length > 0
            ? ` ${summary.unverifiable.length} could not be verified and were left alone.`
            : ''
          const purgedLines = summary.modifiedFiles.reduce((n, f) => n + f.purgedLineCount, 0)
          const backupNote = summary.backupPath
            ? ` Backup: ${summary.backupPath}`
            : summary.backupId === 'demo'
              ? ' Demo mode: nothing was written.'
              : ' No changes were made.'

          setStatusMessage(
            `Purged ${purgedLines} lines across ${summary.modifiedFiles.length} files.${skipped}${backupNote}`,
          )
          setTimeout(() => {
            exit()
            onDone(0)
          }, 300)
        })
        .catch((err) => {
          setStatusMessage(`Error during purge: ${err instanceof Error ? err.message : String(err)}`)
          setIsProcessing(false)
        })
    } else if (input === 'q' || key.escape) {
      exit()
      onDone(0)
    }
  })

  const currentItem = items[cursorIndex]

  // Header = 3 rows, StatusBar = 3 rows, status message = 1 row (if present)
  const overhead = 6 + (statusMessage ? 1 : 0)
  const mainHeight = Math.max(6, rows - overhead)
  const maxListItems = Math.max(3, mainHeight - 4)
  const maxDiffLines = Math.max(4, mainHeight - 4)

  return (
    <Box flexDirection="column" width={columns} height={rows} overflow="hidden">
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" paddingX={1} width="100%">
        <Text bold color="cyan" wrap="truncate-end">
          Alpheus — Diverting the river through your working tree. Select items to purge.
        </Text>
      </Box>

      {/* Main Split Layout */}
      <Box flexDirection="row" flexGrow={1} height={mainHeight} width="100%">
        <Box width="45%" height="100%">
          <FindingList
            items={items}
            cursorIndex={cursorIndex}
            selectedIds={selectedIds}
            maxVisibleItems={maxListItems}
          />
        </Box>
        <Box width="55%" height="100%">
          <DiffPreview item={currentItem} cwd={cwd} maxLines={maxDiffLines} />
        </Box>
      </Box>

      {/* Notifications */}
      {statusMessage && (
        <Box width="100%" paddingX={1}>
          <Text bold color="yellow" wrap="truncate-end">{statusMessage}</Text>
        </Box>
      )}

      {/* Status & Help Bar */}
      <StatusBar selectedCount={selectedIds.size} totalCount={items.length} />
    </Box>
  )
}

/**
 * Runs the interactive TUI application.
 *
 * @param cwd - Repository root directory.
 * @param renderFn - Optional Ink render function (defaults to ink render).
 * @param initialItems - Optional pre-loaded findings (used in demo mode).
 * @returns Exit code promise.
 */
export async function runTui(
  cwd: string,
  renderFn: typeof render = render,
  initialItems?: MiasmaItem[],
): Promise<number> {
  const items = initialItems ?? (await evaluateWorkingTree(cwd))

  if (items.length === 0) {
    console.log('Working tree clean. No agent miasma detected.')
    console.log('Tip: Run `alpheus demo` to explore the interactive TUI with simulated findings.')
    return 0
  }

  let lastSummary: PurgeSummary | undefined

  return new Promise<number>((resolve) => {
    const handlePurge = async (chosen: MiasmaItem[]): Promise<PurgeSummary> => {
      if (initialItems) {
        const modifiedFiles: { path: string; purgedLineCount: number }[] = []
        for (const item of chosen) {
          if (item.category !== 'SCRATCH') {
            const existing = modifiedFiles.find((m) => m.path === item.filePath)
            if (existing) {
              existing.purgedLineCount++
            } else {
              modifiedFiles.push({ path: item.filePath, purgedLineCount: 1 })
            }
          }
        }
        const summary: PurgeSummary = {
          backupId: 'demo',
          backupPath: '',
          modifiedFiles,
          unlinkedFiles: chosen.filter((i) => i.category === 'SCRATCH').map((i) => i.filePath),
          unverifiable: [],
        }
        lastSummary = summary
        return summary
      }
      const summary = await purgeMiasma(cwd, chosen)
      lastSummary = summary
      return summary
    }

    renderFn(
      <App
        items={items}
        cwd={cwd}
        onPurge={handlePurge}
        onDone={(code) => resolve(code)}
      />,
      { alternateScreen: true },
    )
  }).then((code) => {
    if (lastSummary) {
      const purgedLines = lastSummary.modifiedFiles.reduce((acc, f) => acc + f.purgedLineCount, 0)
      const linesWord = purgedLines === 1 ? 'line' : 'lines'
      const filesWord = lastSummary.modifiedFiles.length === 1 ? 'file' : 'files'

      if (lastSummary.modifiedFiles.length > 0) {
        console.log(`Alpheus purged ${purgedLines} ${linesWord} across ${lastSummary.modifiedFiles.length} ${filesWord}.`)
      }
      if (lastSummary.unlinkedFiles.length > 0) {
        console.log(`Deleted ${lastSummary.unlinkedFiles.length} scratch files: ${lastSummary.unlinkedFiles.join(', ')}`)
      }
      if (lastSummary.backupPath) {
        console.log(`Backup saved to ${lastSummary.backupPath}. (Restore anytime via \`alpheus restore\`)`)
      } else if (lastSummary.backupId === 'demo') {
        console.log('Demo mode: nothing was written.')
      } else {
        console.log('Nothing was purged; no changes were made.')
      }
    }
    return code
  })
}

