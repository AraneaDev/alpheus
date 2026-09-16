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
      category: 'LOG',
      ruleId: 'log/typescript',
      span: { startLine: 10, endLine: 10, lines: ['console.log("val")'] },
      explanation: 'Debug log',
      confidence: 1,
    },
    {
      id: 'item-2',
      filePath: 'scratch.py',
      category: 'SCRATCH',
      ruleId: 'scratch/untracked',
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
      unverifiable: [],
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
    expect(frame).toContain('Alpheus, diverting the river through your working tree')
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

  it('starts with only findings at or above the confidence threshold selected', () => {
    const mixedItems: MiasmaItem[] = [
      {
        id: 'high',
        filePath: 'a.ts',
        category: 'LOG',
        ruleId: 'log/js-console',
        span: { startLine: 1, endLine: 1, lines: ['console.log(1)'] },
        explanation: 'Debug log',
        confidence: 0.95,
      },
      {
        id: 'low',
        filePath: 'b.ts',
        category: 'SUPPRESS',
        ruleId: 'suppress/ts',
        span: { startLine: 2, endLine: 2, lines: ['// @ts-expect-error'] },
        explanation: 'check whether it is still needed',
        confidence: 0.4,
      },
    ]

    const { lastFrame } = render(
      <App
        items={mixedItems}
        cwd="/mock/dir"
        onPurge={mockPurge}
        onDone={() => {}}
      />,
    )

    expect(lastFrame()).toContain('Purge Selected (1/2)')
  })

  it('pressing "a" twice ends with an empty selection when the default selection is partial', async () => {
    const mixedItems: MiasmaItem[] = [
      {
        id: 'high',
        filePath: 'a.ts',
        category: 'LOG',
        ruleId: 'log/js-console',
        span: { startLine: 1, endLine: 1, lines: ['console.log(1)'] },
        explanation: 'Debug log',
        confidence: 0.95,
      },
      {
        id: 'low',
        filePath: 'b.ts',
        category: 'SUPPRESS',
        ruleId: 'suppress/ts',
        span: { startLine: 2, endLine: 2, lines: ['// @ts-expect-error'] },
        explanation: 'check whether it is still needed',
        confidence: 0.4,
      },
    ]

    const { stdin, lastFrame } = render(
      <App
        items={mixedItems}
        cwd="/mock/dir"
        onPurge={mockPurge}
        onDone={() => {}}
      />,
    )

    expect(lastFrame()).toContain('Purge Selected (1/2)')

    // First 'a': not everything is selected, so this selects all.
    stdin.write('a')
    await delay(30)
    expect(lastFrame()).toContain('Purge Selected (2/2)')

    // Second 'a': everything is selected, so this empties the set.
    stdin.write('a')
    await delay(30)
    expect(lastFrame()).toContain('Purge Selected (0/2)')
  })

  it('should render FindingList with windowing and scroll indicators on small rows', () => {
    const manyItems: MiasmaItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: `item-${i}`,
      filePath: `file-${i}.ts`,
      category: 'LOG',
      ruleId: 'log/typescript',
      span: { startLine: 1, endLine: 1, lines: [`log-${i}`] },
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
