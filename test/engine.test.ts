import { describe, expect, it } from 'bun:test'
import type { DiffHunk } from '../src/scanner/types.ts'
import { evaluateHunks, evaluateUntracked } from '../src/engine/matcher.ts'

describe('Miasma Engine Orchestrator', () => {
  it('should evaluate diff hunks and produce categorized MiasmaItems', () => {
    const hunks: DiffHunk[] = [
      {
        filePath: 'src/auth.ts',
        startLine: 40,
        lineCount: 3,
        lines: [
          { lineNumber: 40, content: 'const token = "secret";', type: 'add' },
          { lineNumber: 41, content: 'console.log("token is", token);', type: 'add' },
          { lineNumber: 42, content: '// @ts-ignore', type: 'add' },
        ],
      },
    ]

    const items = evaluateHunks(hunks)
    expect(items.length).toBe(2)

    const logItem = items.find((i) => i.category === 'LOG')
    expect(logItem).toBeDefined()
    expect(logItem?.filePath).toBe('src/auth.ts')
    expect(logItem?.lineNumber).toBe(41)

    const suppressItem = items.find((i) => i.category === 'SUPPRESS')
    expect(suppressItem).toBeDefined()
    expect(suppressItem?.lineNumber).toBe(42)
  })

  it('should evaluate untracked scratch files', () => {
    const untracked = ['scratch.py', 'src/normal.ts', 'temp.json']
    const items = evaluateUntracked(untracked)

    expect(items.length).toBe(2)
    expect(items.every((i) => i.category === 'SCRATCH')).toBe(true)
    expect(items.map((i) => i.filePath)).toContain('scratch.py')
    expect(items.map((i) => i.filePath)).toContain('temp.json')
  })

  it('should detect tombstone blocks in hunks', () => {
    const hunks: DiffHunk[] = [
      {
        filePath: 'src/calc.py',
        startLine: 1,
        lineCount: 4,
        lines: [
          { lineNumber: 1, content: '# def old_calc(a, b):', type: 'add' },
          { lineNumber: 2, content: '#     return a + b', type: 'add' },
          { lineNumber: 3, content: '#     x = 1', type: 'add' },
          { lineNumber: 4, content: 'def new_calc(a, b): return a * b', type: 'add' },
        ],
      },
    ]

    const items = evaluateHunks(hunks)
    const tombstone = items.find((i) => i.category === 'TOMBSTONE')
    expect(tombstone).toBeDefined()
    expect(tombstone?.lineNumber).toBe(1)
  })

  it('should detect PATH miasma in hunks', () => {
    const hunks: DiffHunk[] = [
      {
        filePath: 'src/config.ts',
        startLine: 1,
        lineCount: 1,
        lines: [
          { lineNumber: 1, content: 'const path = "/home/developer/secrets.json";', type: 'add' },
        ],
      },
    ]

    const items = evaluateHunks(hunks)
    const pathItem = items.find((i) => i.category === 'PATH')
    expect(pathItem).toBeDefined()
    expect(pathItem?.filePath).toBe('src/config.ts')
    expect(pathItem?.lineNumber).toBe(1)
  })
})
