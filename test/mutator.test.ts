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
        lineNumber: 3,
        category: 'LOG',
        matchedContent: 'console.log("a", a);',
        explanation: 'Debug log',
        confidence: 1,
      },
      {
        id: '2',
        filePath: 'src/test.ts',
        lineNumber: 5,
        category: 'SUPPRESS',
        matchedContent: '// @ts-ignore',
        explanation: 'Suppression',
        confidence: 1,
      },
      {
        id: '3',
        filePath: 'src/test.ts',
        lineNumber: 7,
        category: 'LOG',
        matchedContent: 'console.log("c", c);',
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
        matchedContent: 'scratch.py',
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
        lineNumber: 1,
        category: 'LOG',
        matchedContent: 'console.log("dry run");',
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
        lineNumber: 3,
        category: 'LOG',
        matchedContent: 'console.log("drop");',
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
        matchedContent: 'mixed_scratch.py',
        explanation: 'Scratch',
        confidence: 1,
      },
      {
        id: '2',
        filePath: 'mixed_scratch.py',
        lineNumber: 1,
        category: 'LOG',
        matchedContent: 'print("test")',
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
        lineNumber: 10,
        category: 'LOG',
        matchedContent: 'console.log(1)',
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
        matchedContent: 'scratch_dry.py',
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
        lineNumber: 2,
        category: 'LOG',
        matchedContent: 'console.log(x);',
        explanation: 'Debug log',
        confidence: 1,
      },
      {
        id: '2',
        filePath: 'src/notrail.ts',
        lineNumber: 0, // idx < 0
        category: 'LOG',
        matchedContent: 'out of bounds',
        explanation: 'Debug log',
        confidence: 1,
      },
      {
        id: '3',
        filePath: 'src/notrail.ts',
        lineNumber: 3, // idx === lines.length (boundary test: 3 - 1 === 2, lines.length === 2)
        category: 'LOG',
        matchedContent: 'boundary',
        explanation: 'Debug log',
        confidence: 1,
      },
      {
        id: '4',
        filePath: 'src/notrail.ts',
        lineNumber: 999, // idx > lines.length
        category: 'LOG',
        matchedContent: 'out of bounds',
        explanation: 'Debug log',
        confidence: 1,
      },
      {
        id: '5',
        filePath: 'src/notrail.ts',
        lineNumber: undefined, // undefined line number
        category: 'LOG',
        matchedContent: 'no line',
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
        lineNumber: 2,
        category: 'LOG',
        matchedContent: 'console.log(a);',
        explanation: 'Debug log',
        confidence: 1,
      },
    ]

    await purgeMiasma(TEST_DIR, items)
    const result = readFileSync(join(TEST_DIR, 'src/crlf.ts'), 'utf-8')
    expect(result).toBe('const a = 1;\r\nconst b = 2;\r\n')
  })
})
