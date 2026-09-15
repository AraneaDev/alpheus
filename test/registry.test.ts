import { describe, expect, it } from 'bun:test'
import { RULES } from '../src/engine/rules/registry.ts'

describe('rule registry', () => {
  it('gives every rule a unique id', () => {
    const ids = RULES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('namespaces every id as category/name', () => {
    for (const rule of RULES) {
      expect(rule.id).toMatch(/^[a-z]+\/[a-z0-9-]+$/)
    }
  })

  it('covers all five categories', () => {
    const categories = new Set(RULES.map((r) => r.category))
    expect(categories).toContain('LOG')
    expect(categories).toContain('SUPPRESS')
    expect(categories).toContain('PATH')
    expect(categories).toContain('SCRATCH')
    expect(categories).toContain('TOMBSTONE')
  })

  it('returns confidence in the unit interval for every match', () => {
    const ctx = {
      filePath: 'a.ts',
      lang: 'typescript' as const,
      lines: [{ lineNumber: 1, content: 'console.log(x)' }],
    }

    for (const rule of RULES) {
      for (const match of rule.match(ctx)) {
        expect(match.confidence).toBeGreaterThanOrEqual(0)
        expect(match.confidence).toBeLessThanOrEqual(1)
      }
    }
  })

  it('restricts a rule to its own languages', () => {
    const phpRule = RULES.find((r) => r.id === 'log/php-dump')
    expect(phpRule?.languages).toContain('php')
    expect(phpRule?.languages).not.toContain('typescript')
  })
})
