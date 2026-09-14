import { describe, expect, it } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import type { MiasmaItem, PurgeSummary } from '../src/scanner/types.ts'
import { App } from '../src/tui/app.tsx'

const delay = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))

describe('Interactive Ink TUI App', () => {
  const sampleItems: MiasmaItem[] = [
    {
      id: 'item-1',
      filePath: 'src/test.ts',
      lineNumber: 10,
      category: 'LOG',
      matchedContent: 'console.log("val")',
      explanation: 'Debug log',
      confidence: 1,
    },
    {
      id: 'item-2',
      filePath: 'scratch.py',
      category: 'SCRATCH',
      matchedContent: 'scratch.py',
      explanation: 'Scratch file',
      confidence: 1,
    },
  ]

  const mockPurge = async (_items: MiasmaItem[]): Promise<PurgeSummary> => {
    return {
      backupId: 'test-backup',
      backupPath: '.alpheus/backups/test',
      modifiedFiles: [{ path: 'src/test.ts', purgedLineCount: 1 }],
      unlinkedFiles: ['scratch.py'],
    }
  }

  it('should render the Alpheus header, findings list, and status bar', () => {
    const { lastFrame } = render(
      <App
        items={sampleItems}
        cwd="/mock/dir"
        onPurge={mockPurge}
        onDone={() => {}}
      />,
    )

    const frame = lastFrame() || ''
    expect(frame).toContain('Alpheus — Diverting the river through your working tree')
    expect(frame).toContain('[LOG]')
    expect(frame).toContain('[SCRATCH]')
    expect(frame).toContain('src/test.ts:10')
    expect(frame).toContain('scratch.py')
    expect(frame).toContain('Purge Selected (2/2)')
  })

  it('should toggle selection with spacebar', async () => {
    const { stdin, lastFrame } = render(
      <App
        items={sampleItems}
        cwd="/mock/dir"
        onPurge={mockPurge}
        onDone={() => {}}
      />,
    )

    expect(lastFrame()).toContain('Purge Selected (2/2)')

    // Send space key to toggle first item
    stdin.write(' ')
    await delay(30)
    expect(lastFrame()).toContain('Purge Selected (1/2)')

    // Send space key again to toggle back
    stdin.write(' ')
    await delay(30)
    expect(lastFrame()).toContain('Purge Selected (2/2)')
  })

  it('should toggle all items with "a"', async () => {
    const { stdin, lastFrame } = render(
      <App
        items={sampleItems}
        cwd="/mock/dir"
        onPurge={mockPurge}
        onDone={() => {}}
      />,
    )

    expect(lastFrame()).toContain('Purge Selected (2/2)')

    // Press 'a' to deselect all
    stdin.write('a')
    await delay(30)
    expect(lastFrame()).toContain('Purge Selected (0/2)')

    // Press 'a' again to select all
    stdin.write('a')
    await delay(30)
    expect(lastFrame()).toContain('Purge Selected (2/2)')
  })

  it('should render FindingList with windowing and scroll indicators on small rows', () => {
    const manyItems: MiasmaItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: `item-${i}`,
      filePath: `file-${i}.ts`,
      category: 'LOG',
      matchedContent: `log-${i}`,
      explanation: `test-${i}`,
      confidence: 1,
    }))

    const { lastFrame } = render(
      <App
        items={manyItems}
        cwd="/mock/dir"
        onPurge={mockPurge}
        onDone={() => {}}
        rows={12}
        columns={80}
      />,
    )

    const frame = lastFrame() || ''
    expect(frame).toContain('Miasma Items (10)')
    expect(frame).toContain('below')
  })
})
