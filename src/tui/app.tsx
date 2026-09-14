import React, { useState } from 'react'
import { Box, render, Text, useApp, useInput } from 'ink'
import type { MiasmaItem, PurgeSummary } from '../scanner/types.ts'
import { evaluateWorkingTree } from '../engine/matcher.ts'
import { purgeMiasma } from '../safety/mutator.ts'
import { DiffPreview } from './components/diff-preview.tsx'
import { FindingList } from './components/finding-list.tsx'
import { StatusBar } from './components/status-bar.tsx'

export interface AppProps {
  items: MiasmaItem[]
  cwd: string
  onPurge: (selectedItems: MiasmaItem[]) => Promise<PurgeSummary>
  onDone: (exitCode: number) => void
}

export const App: React.FC<AppProps> = ({ items, cwd, onPurge, onDone }) => {
  const { exit } = useApp()
  const [cursorIndex, setCursorIndex] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(items.map((i) => i.id)), // Selected by default
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
          setStatusMessage(
            `✨ Purged ${chosen.length} items across ${summary.modifiedFiles.length} files. Backup: ${summary.backupPath}`,
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

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">
          Alpheus — Diverting the river through your working tree. Select items to purge.
        </Text>
      </Box>

      {/* Main Split Layout */}
      <Box flexDirection="row" height={16}>
        <Box width="50%" marginRight={1}>
          <FindingList
            items={items}
            cursorIndex={cursorIndex}
            selectedIds={selectedIds}
          />
        </Box>
        <Box width="50%">
          <DiffPreview item={currentItem} cwd={cwd} />
        </Box>
      </Box>

      {/* Status & Help Bar */}
      <StatusBar selectedCount={selectedIds.size} totalCount={items.length} />

      {/* Notifications */}
      {statusMessage && (
        <Box marginTop={1}>
          <Text bold color="yellow">{statusMessage}</Text>
        </Box>
      )}
    </Box>
  )
}

/**
 * Runs the interactive TUI application.
 *
 * @param cwd - Repository root directory.
 * @returns Exit code promise.
 */
export async function runTui(cwd: string): Promise<number> {
  const items = await evaluateWorkingTree(cwd)

  if (items.length === 0) {
    console.log('✨ Working tree clean. No agent miasma detected.')
    return 0
  }

  return new Promise((resolve) => {
    const handlePurge = async (chosen: MiasmaItem[]) => {
      return await purgeMiasma(cwd, chosen)
    }

    render(
      <App
        items={items}
        cwd={cwd}
        onPurge={handlePurge}
        onDone={(code) => resolve(code)}
      />,
    )
  })
}
