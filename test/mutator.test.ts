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
    expect(summary.modifiedFiles.length).toBe(1)
    expect(readFileSync(join(TEST_DIR, 'src/dry.ts'), 'utf-8')).toBe(fileContent)
    expect(existsSync(join(TEST_DIR, '.alpheus/backups'))).toBe(false)
  })

  it('should collapse consecutive blank lines when purging', async () => {
    const fileContent = 'const a = 1;\n\nconsole.log("drop");\n\nconst b = 2;\n'
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
    expect(result).toBe('const a = 1;\n\nconst b = 2;\n')
  })
})
