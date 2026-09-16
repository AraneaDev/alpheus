import { describe, expect, it } from 'bun:test'
import type { MiasmaItem } from '../src/scanner/types.ts'
import { formatTable } from '../src/reporter/table.ts'
import { formatJson } from '../src/reporter/json.ts'

describe('CLI Reporters', () => {
  const sampleItems: MiasmaItem[] = [
    {
      id: '1',
      filePath: 'src/auth.ts',
      category: 'LOG',
      ruleId: 'log/typescript',
      span: { startLine: 42, endLine: 42, lines: ['console.log("token")'] },
      explanation: 'Ephemeral console statement',
      confidence: 1,
    },
    {
      id: '2',
      filePath: 'scratch.py',
      category: 'SCRATCH',
      ruleId: 'scratch/untracked',
      explanation: 'Untracked scratch file',
      confidence: 1,
    },
  ]

  it('should format findings into a structured terminal table', () => {
    const table = formatTable(sampleItems)
    expect(table).toContain('[LOG]')
    expect(table).toContain('[SCRATCH]')
    expect(table).toContain('src/auth.ts:42')
    expect(table).toContain('scratch.py')
    expect(table).toContain('Alpheus found 2 agent miasma items')
  })

  it('should return clean message when no items present', () => {
    const table = formatTable([])
    expect(table).toContain('Working tree clean')
  })

  it('should format findings into valid JSON', () => {
    const jsonStr = formatJson(sampleItems)
    const parsed = JSON.parse(jsonStr)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBe(2)
    expect(parsed[0].category).toBe('LOG')
    expect(parsed[1].category).toBe('SCRATCH')
  })
})
