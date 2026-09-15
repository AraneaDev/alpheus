import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { MiasmaItem } from '../src/scanner/types.ts'
import { purgeMiasma } from '../src/safety/mutator.ts'

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
    expect(result).toBe('const x = 1;')
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
