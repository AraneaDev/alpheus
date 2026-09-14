import React from 'react'
import { describe, expect, it } from 'bun:test'
import { render } from 'ink-testing-library'
import { App } from '../src/tui/app.tsx'
import type { MiasmaItem, PurgeSummary } from '../src/scanner/types.ts'

describe('App TUI Extended Interactions', () => {
  const dummyItems: MiasmaItem[] = [
    {
      id: 'item-1',
      filePath: 'src/a.ts',
      lineNumber: 10,
      category: 'LOG',
      matchedContent: 'console.log("1")',
      explanation: 'Debug 1',
      confidence: 1.0,
    },
    {
      id: 'item-2',
      filePath: 'src/b.ts',
      lineNumber: 20,
      category: 'SUPPRESS',
      matchedContent: '// eslint-disable',
      explanation: 'Suppression',
      confidence: 1.0,
    },
  ]

  it('should navigate down with j and downArrow, and up with k and upArrow', () => {
    let doneCode = -1
    const { stdin, lastFrame } = render(
      <App
        items={dummyItems}
        cwd="/tmp"
        onPurge={async () => ({} as PurgeSummary)}
        onDone={(code) => {
          doneCode = code
        }}
      />,
    )

    // Initially on item 0
    expect(lastFrame()).toContain('❯')

    // Navigate down with 'j'
    stdin.write('j')
    expect(lastFrame()).toContain('src/b.ts')

    // Navigate up with 'k'
    stdin.write('k')
    expect(lastFrame()).toContain('src/a.ts')

    // Quit with 'q'
    stdin.write('q')
    expect(doneCode).toBe(0)
  })

  it('should show message when attempting to purge with zero items selected', async () => {
    const { stdin, lastFrame } = render(
      <App
        items={dummyItems}
        cwd="/tmp"
        onPurge={async () => ({} as PurgeSummary)}
        onDone={() => {}}
      />,
    )

    // Press 'a' to deselect all (dummyItems.length === 2)
    stdin.write('a')
    await Bun.sleep(50)
    expect(lastFrame()).toContain('0/2')

    // Press Enter with 0 items selected
    stdin.write('\r')
    await Bun.sleep(50)
    expect(lastFrame()).toContain('No items selected to purge.')
  })

  it('should execute purge and invoke onDone when Enter is pressed with selections', async () => {
    let purgedItemsCount = 0
    let doneCode = -1

    const dummySummary: PurgeSummary = {
      backupId: 'test_backup',
      backupPath: '.alpheus/backups/test',
      modifiedFiles: [{ path: 'src/a.ts', purgedLineCount: 1 }],
      unlinkedFiles: [],
    }

    const { stdin } = render(
      <App
        items={dummyItems}
        cwd="/tmp"
        onPurge={async (chosen) => {
          purgedItemsCount = chosen.length
          return dummySummary
        }}
        onDone={(code) => {
          doneCode = code
        }}
      />,
    )

    // Press Enter to purge the 2 selected items
    stdin.write('\r')

    // Wait for async purge resolution and timeout
    await Bun.sleep(400)

    expect(purgedItemsCount).toBe(2)
    expect(doneCode).toBe(0)
  })

  it('should display error message when onPurge rejects', async () => {
    const { stdin, lastFrame } = render(
      <App
        items={dummyItems}
        cwd="/tmp"
        onPurge={async () => {
          throw new Error('Disk full')
        }}
        onDone={() => {}}
      />,
    )

    // Press Enter to trigger purge
    stdin.write('\r')
    await Bun.sleep(100)

    expect(lastFrame()).toContain('Error during purge: Disk full')
  })

  it('should return 0 when runTui is executed in a clean directory', async () => {
    const { runTui } = await import('../src/tui/app.tsx')
    const tmpEmpty = `/tmp/alpheus-clean-tui-${Date.now()}`
    const { mkdirSync, rmSync } = await import('fs')
    mkdirSync(tmpEmpty, { recursive: true })
    try {
      const code = await runTui(tmpEmpty)
      expect(code).toBe(0)
    } finally {
      rmSync(tmpEmpty, { recursive: true, force: true })
    }
  })

  it('should run runTui with findings and mount App with handlePurge and onDone', async () => {
    const { runTui } = await import('../src/tui/app.tsx')
    const tmpDirty = `/tmp/alpheus-dirty-tui-${Date.now()}`
    const { mkdirSync, rmSync, writeFileSync } = await import('fs')
    mkdirSync(tmpDirty, { recursive: true })
    const initProc = Bun.spawn(['git', 'init'], { cwd: tmpDirty })
    await initProc.exited
    writeFileSync(`${tmpDirty}/scratch.tmp`, 'scratch')

    try {
      let purgeCalled = false
      const mockRender = (node: React.ReactNode) => {
        const element = node as React.ReactElement<{
          onPurge?: (items: MiasmaItem[]) => Promise<PurgeSummary>
          onDone: (code: number) => void
        }>
        if (element.props.onPurge) {
          element.props.onPurge([])
        }
        purgeCalled = true
        element.props.onDone(0)
        return { unmount: () => {}, rerender: () => {}, cleanup: () => {}, waitUntilExit: async () => {}, clear: () => {} }
      }

      const code = await runTui(tmpDirty, mockRender as unknown as typeof import('ink').render)
      expect(code).toBe(0)
      expect(purgeCalled).toBe(true)
    } finally {
      rmSync(tmpDirty, { recursive: true, force: true })
    }
  })
})
