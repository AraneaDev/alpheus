import React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { render } from 'ink-testing-library'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DiffPreview } from '../src/tui/components/diff-preview.tsx'
import type { MiasmaItem } from '../src/scanner/types.ts'

describe('DiffPreview Component', () => {
  const tmpDir = join('/tmp', `alpheus-preview-test-${Date.now()}`)

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should render placeholder when no item is provided', () => {
    const { lastFrame } = render(<DiffPreview cwd={tmpDir} />)
    expect(lastFrame()).toContain('No finding selected.')
  })

  it('should render missing file notice when file does not exist', () => {
    const item: MiasmaItem = {
      id: 'missing-1',
      filePath: 'nonexistent.ts',
      category: 'LOG',
      matchedContent: 'console.log("x")',
      explanation: 'Debug log',
      confidence: 1.0,
    }
    const { lastFrame } = render(<DiffPreview item={item} cwd={tmpDir} />)
    expect(lastFrame()).toContain('File does not exist on disk: nonexistent.ts')
  })

  it('should render context lines with target highlighting for modified files', () => {
    writeFileSync(join(tmpDir, 'test.ts'), 'const a = 1;\nconsole.log(a);\nreturn a;\n')
    const item: MiasmaItem = {
      id: 'log-1',
      filePath: 'test.ts',
      lineNumber: 2,
      category: 'LOG',
      matchedContent: 'console.log(a);',
      explanation: 'Debug print',
      confidence: 1.0,
      contextLines: [
        { line: 1, content: 'const a = 1;', isTarget: false },
        { line: 2, content: 'console.log(a);', isTarget: true },
        { line: 3, content: 'return a;', isTarget: false },
      ],
    }

    const { lastFrame } = render(<DiffPreview item={item} cwd={tmpDir} />)
    const frame = lastFrame() || ''
    expect(frame).toContain('Context: test.ts:2')
    expect(frame).toContain('const a = 1;')
    expect(frame).toContain('console.log(a);')
    expect(frame).toContain('return a;')
  })

  it('should render whole-file preview for scratch files with truncation', () => {
    // Generate 25 lines
    const lines = Array.from({ length: 25 }, (_, i) => `line ${i + 1} content`)
    writeFileSync(join(tmpDir, 'scratch.txt'), lines.join('\n'))

    const item: MiasmaItem = {
      id: 'scratch-1',
      filePath: 'scratch.txt',
      category: 'SCRATCH',
      matchedContent: 'Entire untracked file: scratch.txt',
      explanation: 'Scratch file',
      confidence: 1.0,
    }

    const { lastFrame } = render(<DiffPreview item={item} cwd={tmpDir} />)
    const frame = lastFrame() || ''
    expect(frame).toContain('Scratch File: scratch.txt')
    expect(frame).toContain('line 1 content')
    expect(frame).toContain('line 6 content')
  })

  it('should read context lines directly from disk when contextLines array is omitted', () => {
    writeFileSync(join(tmpDir, 'disk.ts'), 'line 1\nline 2\nconsole.log("disk");\nline 4\nline 5\n')
    const item: MiasmaItem = {
      id: 'disk-1',
      filePath: 'disk.ts',
      lineNumber: 3,
      category: 'LOG',
      matchedContent: 'console.log("disk");',
      explanation: 'Debug log',
      confidence: 1.0,
    }

    const { lastFrame } = render(<DiffPreview item={item} cwd={tmpDir} />)
    const frame = lastFrame() || ''
    expect(frame).toContain('Context: disk.ts:3')
    expect(frame).toContain('console.log("disk");')
    expect(frame).toContain('line 1')
  })

  it('should render scratch preview fallback when scratch file does not exist on disk', () => {
    const item: MiasmaItem = {
      id: 'scratch-missing',
      filePath: 'untracked-ghost.tmp',
      category: 'SCRATCH',
      matchedContent: 'untracked-ghost.tmp',
      explanation: 'Scratch file',
      confidence: 1.0,
    }

    const { lastFrame } = render(<DiffPreview item={item} cwd={tmpDir} />)
    const frame = lastFrame() || ''
    expect(frame).toContain('Scratch File: untracked-ghost.tmp')
    expect(frame).toContain('(untracked scratch file preview)')
  })

  it('should render context lines when provided directly on item without file on disk', () => {
    const item: MiasmaItem = {
      id: 'context-direct',
      filePath: 'nonexistent-source.ts',
      lineNumber: 10,
      category: 'LOG',
      matchedContent: 'console.log("demo")',
      explanation: 'Direct context',
      confidence: 1.0,
      contextLines: [
        { line: 9, content: 'const a = 1;', isTarget: false },
        { line: 10, content: 'console.log("demo");', isTarget: true },
        { line: 11, content: 'const b = 2;', isTarget: false },
      ],
    }

    const { lastFrame } = render(<DiffPreview item={item} cwd={tmpDir} />)
    const frame = lastFrame() || ''
    expect(frame).toContain('Context: nonexistent-source.ts:10')
    expect(frame).toContain('console.log("demo");')
  })
})
