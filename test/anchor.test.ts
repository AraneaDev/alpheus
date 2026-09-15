import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { anchorFindings } from '../src/engine/anchor.ts'
import type {
  AnchoredItem,
  AnchorResult,
  UnverifiableItem,
  UnverifiableReason,
} from '../src/engine/anchor.ts'
import type { MiasmaItem } from '../src/scanner/types.ts'

const DIR = join(import.meta.dir, 'tmp_anchor_test')

function item(startLine: number, lines: string[]): MiasmaItem {
  return {
    id: `log-${startLine}`,
    filePath: 'app.ts',
    category: 'LOG',
    ruleId: 'log/typescript',
    span: { startLine, endLine: startLine + lines.length - 1, lines },
    explanation: 'Debug log',
    confidence: 1,
  }
}

describe('anchorFindings', () => {
  beforeEach(() => {
    rmSync(DIR, { recursive: true, force: true })
    mkdirSync(DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(DIR, { recursive: true, force: true })
  })

  it('anchors in place when the recorded line still matches', () => {
    writeFileSync(join(DIR, 'app.ts'), 'const a = 1\nconsole.log(a)\n')

    const result: AnchorResult = anchorFindings(DIR, [item(2, ['console.log(a)'])])
    const anchoredItem: AnchoredItem = result.anchored[0]

    expect(result.unverifiable).toHaveLength(0)
    expect(anchoredItem.resolvedSpan.startLine).toBe(2)
  })

  it('re-anchors when the line has moved, which is the partial-stage case', () => {
    writeFileSync(
      join(DIR, 'app.ts'),
      'const x = 10\nconst y = 11\nconst z = 12\nconst a = 1\nconsole.log(a)\n',
    )

    // The staged diff reported line 2; the worktree has it at line 5.
    const result: AnchorResult = anchorFindings(DIR, [item(2, ['console.log(a)'])])

    expect(result.unverifiable).toHaveLength(0)
    expect(result.anchored[0].resolvedSpan.startLine).toBe(5)
    expect(result.anchored[0].resolvedSpan.endLine).toBe(5)
  })

  it('refuses when the text appears more than once', () => {
    writeFileSync(join(DIR, 'app.ts'), 'console.log(a)\nconst b = 2\nconsole.log(a)\n')

    const result: AnchorResult = anchorFindings(DIR, [item(7, ['console.log(a)'])])
    const unverifiableItem: UnverifiableItem = result.unverifiable[0]
    const reason: UnverifiableReason = unverifiableItem.reason

    expect(result.anchored).toHaveLength(0)
    expect(reason).toBe('ambiguous')
  })

  it('refuses when the text is gone', () => {
    writeFileSync(join(DIR, 'app.ts'), 'const a = 1\n')

    const result: AnchorResult = anchorFindings(DIR, [item(2, ['console.log(a)'])])

    expect(result.anchored).toHaveLength(0)
    expect(result.unverifiable[0].reason).toBe('not-found')
  })

  it('refuses when the file is gone', () => {
    const result: AnchorResult = anchorFindings(DIR, [item(2, ['console.log(a)'])])

    expect(result.unverifiable[0].reason).toBe('missing-file')
  })

  it('anchors a multi-line span only on a full consecutive match', () => {
    writeFileSync(join(DIR, 'app.ts'), 'x\n// one\n// two\n// three\ny\n')

    const result: AnchorResult = anchorFindings(DIR, [item(1, ['// one', '// two', '// three'])])

    expect(result.anchored[0].resolvedSpan.startLine).toBe(2)
    expect(result.anchored[0].resolvedSpan.endLine).toBe(4)
  })

  it('passes scratch findings through, since they have no span', () => {
    writeFileSync(join(DIR, 'temp.bak'), 'junk\n')

    const scratch: MiasmaItem = {
      id: 'scratch-1',
      filePath: 'temp.bak',
      category: 'SCRATCH',
      ruleId: 'scratch/untracked',
      explanation: 'Scratch file',
      confidence: 1,
    }

    const result: AnchorResult = anchorFindings(DIR, [scratch])

    expect(result.anchored).toHaveLength(1)
    expect(result.unverifiable).toHaveLength(0)
  })

  it('deduplicates two findings that resolve to the same place', () => {
    writeFileSync(join(DIR, 'app.ts'), 'const a = 1\nconsole.log(a)\n')

    // The same line reported by both the staged and the unstaged diff.
    const result: AnchorResult = anchorFindings(DIR, [
      item(2, ['console.log(a)']),
      item(5, ['console.log(a)']),
    ])

    expect(result.anchored).toHaveLength(1)
  })
})
