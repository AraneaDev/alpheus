import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { MiasmaItem } from '../src/scanner/types.ts'
import { assertOnlyRangesRemoved, purgeMiasma } from '../src/safety/mutator.ts'
import type { PhysicalLine } from '../src/safety/lines.ts'

const TEST_DIR = join(import.meta.dir, 'tmp_mutator_test')

describe('In-Place File Mutator', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
    mkdirSync(join(TEST_DIR, 'src'), { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('should slice out multiple lines bottom-up without line offset drift', async () => {
    const originalContent = [
      'function test() {',
      '  const a = 1;',
      '  console.log("a", a);', // Line 3
      '  const b = 2;',
      '  // @ts-ignore',        // Line 5
      '  const c = a + b;',
      '  console.log("c", c);', // Line 7
      '  return c;',
      '}',
      '',
    ].join('\n')

    writeFileSync(join(TEST_DIR, 'src/test.ts'), originalContent)

    const items: MiasmaItem[] = [
      {
        id: '1',
        filePath: 'src/test.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        span: { startLine: 3, endLine: 3, lines: ['  console.log("a", a);'] },
        explanation: 'Debug log',
        confidence: 1,
      },
      {
        id: '2',
        filePath: 'src/test.ts',
        category: 'SUPPRESS',
        ruleId: 'suppress/typescript',
        span: { startLine: 5, endLine: 5, lines: ['  // @ts-ignore'] },
        explanation: 'Suppression',
        confidence: 1,
      },
      {
        id: '3',
        filePath: 'src/test.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        span: { startLine: 7, endLine: 7, lines: ['  console.log("c", c);'] },
        explanation: 'Debug log',
        confidence: 1,
      },
    ]

    const summary = await purgeMiasma(TEST_DIR, items)
    expect(summary.modifiedFiles.length).toBe(1)
    expect(summary.modifiedFiles[0].purgedLineCount).toBe(3)

    const updatedContent = readFileSync(join(TEST_DIR, 'src/test.ts'), 'utf-8')
    const expectedContent = [
      'function test() {',
      '  const a = 1;',
      '  const b = 2;',
      '  const c = a + b;',
      '  return c;',
      '}',
      '',
    ].join('\n')

    expect(updatedContent).toBe(expectedContent)
  })

  it('should unlink scratch files', async () => {
    writeFileSync(join(TEST_DIR, 'scratch.py'), 'print("temp")\n')
    expect(existsSync(join(TEST_DIR, 'scratch.py'))).toBe(true)

    const items: MiasmaItem[] = [
      {
        id: '1',
        filePath: 'scratch.py',
        category: 'SCRATCH',
        ruleId: 'scratch/untracked',
        explanation: 'Scratch file',
        confidence: 1,
      },
    ]

    const summary = await purgeMiasma(TEST_DIR, items)
    expect(summary.unlinkedFiles).toContain('scratch.py')
    expect(existsSync(join(TEST_DIR, 'scratch.py'))).toBe(false)
  })

  it('should support dry-run mode without modifying files or creating backups', async () => {
    const fileContent = 'console.log("dry run");\n'
    writeFileSync(join(TEST_DIR, 'src/dry.ts'), fileContent)

    const items: MiasmaItem[] = [
      {
        id: '1',
        filePath: 'src/dry.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        span: { startLine: 1, endLine: 1, lines: ['console.log("dry run");'] },
        explanation: 'Debug log',
        confidence: 1,
      },
    ]

    const summary = await purgeMiasma(TEST_DIR, items, { dryRun: true })
    expect(summary.backupId).toBe('dry-run')
    expect(summary.backupPath).toBe('none')
    expect(summary.modifiedFiles.length).toBe(1)
    expect(readFileSync(join(TEST_DIR, 'src/dry.ts'), 'utf-8')).toBe(fileContent)
    expect(existsSync(join(TEST_DIR, '.alpheus/backups'))).toBe(false)
  })

  it('should collapse consecutive blank lines when purging including whitespace-only lines', async () => {
    const fileContent = 'const a = 1;\n   \nconsole.log("drop");\n   \nconst b = 2;\n'
    writeFileSync(join(TEST_DIR, 'src/collapse.ts'), fileContent)

    const items: MiasmaItem[] = [
      {
        id: '1',
        filePath: 'src/collapse.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        span: { startLine: 3, endLine: 3, lines: ['console.log("drop");'] },
        explanation: 'Debug log',
        confidence: 1,
      },
    ]

    await purgeMiasma(TEST_DIR, items)
    const result = readFileSync(join(TEST_DIR, 'src/collapse.ts'), 'utf-8')
    expect(result).toBe('const a = 1;\n   \nconst b = 2;\n')
  })

  it('should unlink file when items contain both SCRATCH and LOG categories', async () => {
    writeFileSync(join(TEST_DIR, 'mixed_scratch.py'), 'print("test")\n')
    const items: MiasmaItem[] = [
      {
        id: '1',
        filePath: 'mixed_scratch.py',
        category: 'SCRATCH',
        ruleId: 'scratch/untracked',
        explanation: 'Scratch',
        confidence: 1,
      },
      {
        id: '2',
        filePath: 'mixed_scratch.py',
        category: 'LOG',
        ruleId: 'log/python',
        span: { startLine: 1, endLine: 1, lines: ['print("test")'] },
        explanation: 'Log',
        confidence: 1,
      },
    ]

    const summary = await purgeMiasma(TEST_DIR, items)
    expect(summary.unlinkedFiles).toContain('mixed_scratch.py')
    expect(existsSync(join(TEST_DIR, 'mixed_scratch.py'))).toBe(false)
  })

  it('should skip non-existent files gracefully', async () => {
    const items: MiasmaItem[] = [
      {
        id: '1',
        filePath: 'src/does_not_exist.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        span: { startLine: 10, endLine: 10, lines: ['console.log(1)'] },
        explanation: 'Debug log',
        confidence: 1,
      },
    ]

    const summary = await purgeMiasma(TEST_DIR, items)
    expect(summary.modifiedFiles.length).toBe(0)
    expect(summary.unlinkedFiles.length).toBe(0)
  })

  it('should not unlink scratch files in dry-run mode', async () => {
    writeFileSync(join(TEST_DIR, 'scratch_dry.py'), 'print("keep me")\n')
    const items: MiasmaItem[] = [
      {
        id: '1',
        filePath: 'scratch_dry.py',
        category: 'SCRATCH',
        ruleId: 'scratch/untracked',
        explanation: 'Scratch',
        confidence: 1,
      },
    ]

    const summary = await purgeMiasma(TEST_DIR, items, { dryRun: true })
    expect(summary.unlinkedFiles).toContain('scratch_dry.py')
    expect(existsSync(join(TEST_DIR, 'scratch_dry.py'))).toBe(true)
  })

  it('should preserve files without trailing newline and ignore out-of-bounds line numbers', async () => {
    const contentNoTrailingNewline = 'const x = 1;\nconsole.log(x);' // Line 2, no trailing \n
    writeFileSync(join(TEST_DIR, 'src/notrail.ts'), contentNoTrailingNewline)

    const items: MiasmaItem[] = [
      {
        id: '1',
        filePath: 'src/notrail.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        span: { startLine: 2, endLine: 2, lines: ['console.log(x);'] },
        explanation: 'Debug log',
        confidence: 1,
      },
      {
        id: '2',
        filePath: 'src/notrail.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        span: { startLine: 0, endLine: 0, lines: ['out of bounds'] }, // idx < 0
        explanation: 'Debug log',
        confidence: 1,
      },
      {
        id: '3',
        filePath: 'src/notrail.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        // idx === lines.length (boundary test: 3 - 1 === 2, lines.length === 2)
        span: { startLine: 3, endLine: 3, lines: ['boundary'] },
        explanation: 'Debug log',
        confidence: 1,
      },
      {
        id: '4',
        filePath: 'src/notrail.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        span: { startLine: 999, endLine: 999, lines: ['out of bounds'] }, // idx > lines.length
        explanation: 'Debug log',
        confidence: 1,
      },
      {
        id: '5',
        filePath: 'src/notrail.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        // no span: undefined line number
        explanation: 'Debug log',
        confidence: 1,
      },
    ]

    await purgeMiasma(TEST_DIR, items)
    const result = readFileSync(join(TEST_DIR, 'src/notrail.ts'), 'utf-8')
    // The removed line was the file's last, but the newline after "const x = 1;"
    // was never part of the removed range: it belongs to the surviving line,
    // whose own terminator is preserved untouched.
    expect(result).toBe('const x = 1;\n')
  })

  it('should preserve CRLF line delimiters when modifying files', async () => {
    const crlfContent = 'const a = 1;\r\nconsole.log(a);\r\nconst b = 2;\r\n'
    writeFileSync(join(TEST_DIR, 'src/crlf.ts'), crlfContent)

    const items: MiasmaItem[] = [
      {
        id: '1',
        filePath: 'src/crlf.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        span: { startLine: 2, endLine: 2, lines: ['console.log(a);'] },
        explanation: 'Debug log',
        confidence: 1,
      },
    ]

    await purgeMiasma(TEST_DIR, items)
    const result = readFileSync(join(TEST_DIR, 'src/crlf.ts'), 'utf-8')
    expect(result).toBe('const a = 1;\r\nconst b = 2;\r\n')
  })
})

describe('purgeMiasma safety', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
    mkdirSync(join(TEST_DIR, 'src'), { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('leaves every unselected line byte-identical', async () => {
    const before = 'import os\n\n\ndef alpha():\n    print("dbg")\n    return 1\n\n\ndef beta():\n    return 2\n'
    writeFileSync(join(TEST_DIR, 'mod.py'), before)

    await purgeMiasma(TEST_DIR, [
      {
        id: 'log-1',
        filePath: 'mod.py',
        category: 'LOG',
        ruleId: 'log/python',
        span: { startLine: 5, endLine: 5, lines: ['    print("dbg")'] },
        explanation: 'Debug print',
        confidence: 1,
      },
    ], { skipBackup: true })

    const after = readFileSync(join(TEST_DIR, 'mod.py'), 'utf-8')
    expect(after).toBe('import os\n\n\ndef alpha():\n    return 1\n\n\ndef beta():\n    return 2\n')
  })

  it('removes every line of a tombstone block', async () => {
    const block = '# a = compute(x)\n# if a > 0:\n#     return a\n# for row in rows:\n'
    writeFileSync(join(TEST_DIR, 'dead.py'), `start\n${block}end\n`)

    await purgeMiasma(TEST_DIR, [
      {
        id: 'tombstone-1',
        filePath: 'dead.py',
        category: 'TOMBSTONE',
        ruleId: 'tombstone/block',
        span: {
          startLine: 2,
          endLine: 5,
          lines: ['# a = compute(x)', '# if a > 0:', '#     return a', '# for row in rows:'],
        },
        explanation: 'Commented-out dead code block (4 lines)',
        confidence: 0.9,
      },
    ], { skipBackup: true })

    expect(readFileSync(join(TEST_DIR, 'dead.py'), 'utf-8')).toBe('start\nend\n')
  })

  it('refuses to delete a line whose text has changed, and reports it', async () => {
    writeFileSync(join(TEST_DIR, 'app.ts'), 'const a = 1\nconst b = 2\n')

    const summary = await purgeMiasma(TEST_DIR, [
      {
        id: 'log-1',
        filePath: 'app.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        span: { startLine: 1, endLine: 1, lines: ['console.log(a)'] },
        explanation: 'Debug log',
        confidence: 1,
      },
    ], { skipBackup: true })

    expect(readFileSync(join(TEST_DIR, 'app.ts'), 'utf-8')).toBe('const a = 1\nconst b = 2\n')
    expect(summary.modifiedFiles).toHaveLength(0)
    expect(summary.unverifiable).toHaveLength(1)
    expect(summary.unverifiable[0].reason).toBe('not-found')
  })

  it('deletes the moved line rather than whatever sits at the recorded number', async () => {
    writeFileSync(
      join(TEST_DIR, 'app.ts'),
      'const x = 10\nconst y = 11\nconst z = 12\nconst a = 1\nconsole.log(a)\n',
    )

    await purgeMiasma(TEST_DIR, [
      {
        id: 'log-1',
        filePath: 'app.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        // The staged diff said line 2. The worktree has it at line 5.
        span: { startLine: 2, endLine: 2, lines: ['console.log(a)'] },
        explanation: 'Debug log',
        confidence: 1,
      },
    ], { skipBackup: true })

    const after = readFileSync(join(TEST_DIR, 'app.ts'), 'utf-8')
    expect(after).toBe('const x = 10\nconst y = 11\nconst z = 12\nconst a = 1\n')
    expect(after).toContain('const a = 1')
  })

  it('preserves CRLF endings', async () => {
    writeFileSync(join(TEST_DIR, 'win.ts'), 'const a = 1\r\nconsole.log(a)\r\nconst b = 2\r\n')

    await purgeMiasma(TEST_DIR, [
      {
        id: 'log-1',
        filePath: 'win.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        span: { startLine: 2, endLine: 2, lines: ['console.log(a)'] },
        explanation: 'Debug log',
        confidence: 1,
      },
    ], { skipBackup: true })

    expect(readFileSync(join(TEST_DIR, 'win.ts'), 'utf-8')).toBe('const a = 1\r\nconst b = 2\r\n')
  })
})

describe('assertOnlyRangesRemoved', () => {
  const line = (content: string): PhysicalLine => ({ content, terminator: '\n' })

  it('throws when a line outside the removed set is also missing', () => {
    // The reviewer's counterexample: only line 3 ("DELETE") was asked for,
    // but a buggy caller also lost line 5 ("e"). A budget-based check that
    // tolerates "one extra line per range" lets this through silently.
    const original = [line('a'), line('b'), line('DELETE'), line('d'), line('e')]
    const remaining = [line('a'), line('b'), line('d')]

    expect(() => assertOnlyRangesRemoved(original, remaining, new Set([3]))).toThrow()
  })

  it('does not throw when exactly the removed lines are missing', () => {
    const original = [line('a'), line('b'), line('DELETE'), line('d'), line('e')]
    const remaining = [line('a'), line('b'), line('d'), line('e')]

    expect(() => assertOnlyRangesRemoved(original, remaining, new Set([3]))).not.toThrow()
  })

  it('throws when a surviving line has the right content but the wrong terminator', () => {
    const original = [
      { content: 'a', terminator: '\r\n' },
      { content: 'DELETE', terminator: '\r\n' },
      { content: 'b', terminator: '\r\n' },
    ]
    const remaining = [
      { content: 'a', terminator: '\n' },
      { content: 'b', terminator: '\r\n' },
    ]

    expect(() => assertOnlyRangesRemoved(original, remaining, new Set([2]))).toThrow()
  })
})
