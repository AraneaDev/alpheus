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
      ruleId: 'log/typescript',
      span: { startLine: 1, endLine: 1, lines: ['console.log("x")'] },
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
      category: 'LOG',
      ruleId: 'log/typescript',
      span: { startLine: 2, endLine: 2, lines: ['console.log(a);'] },
      explanation: 'Debug print',
      confidence: 1.0,
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
      ruleId: 'scratch/untracked',
      explanation: 'Scratch file',
      confidence: 1.0,
    }

    const { lastFrame } = render(<DiffPreview item={item} cwd={tmpDir} />)
    const frame = lastFrame() || ''
    expect(frame).toContain('Scratch File: scratch.txt')
    expect(frame).toContain('line 1 content')
    expect(frame).toContain('line 6 content')
  })

  it('should read context lines directly from disk for the finding span', () => {
    writeFileSync(join(tmpDir, 'disk.ts'), 'line 1\nline 2\nconsole.log("disk");\nline 4\nline 5\n')
    const item: MiasmaItem = {
      id: 'disk-1',
      filePath: 'disk.ts',
      category: 'LOG',
      ruleId: 'log/typescript',
      span: { startLine: 3, endLine: 3, lines: ['console.log("disk");'] },
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
      ruleId: 'scratch/untracked',
      explanation: 'Scratch file',
      confidence: 1.0,
    }

    const { lastFrame } = render(<DiffPreview item={item} cwd={tmpDir} />)
    const frame = lastFrame() || ''
    expect(frame).toContain('Scratch File: untracked-ghost.tmp')
    expect(frame).toContain('(untracked scratch file preview)')
  })

  it('should mark every line of a multi-line span as a target', () => {
    writeFileSync(
      join(tmpDir, 'multi.ts'),
      'const a = 1;\n// old line one\n// old line two\nconst b = 2;\n',
    )
    const item: MiasmaItem = {
      id: 'context-direct',
      filePath: 'multi.ts',
      category: 'TOMBSTONE',
      ruleId: 'tombstone/typescript',
      span: { startLine: 2, endLine: 3, lines: ['// old line one', '// old line two'] },
      explanation: 'Commented-out dead code block',
      confidence: 0.9,
    }

    const { lastFrame } = render(<DiffPreview item={item} cwd={tmpDir} />)
    const frame = lastFrame() || ''
    expect(frame).toContain('Context: multi.ts:2')
    // Both lines of the span are rendered with the target ("- ") marker.
    expect(frame).toContain('- // old line one')
    expect(frame).toContain('- // old line two')
  })

  it('should window the preview around the target span when content exceeds maxLines', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `code line ${i + 1}`)
    writeFileSync(join(tmpDir, 'windowed.ts'), lines.join('\n'))

    const item: MiasmaItem = {
      id: 'window-1',
      filePath: 'windowed.ts',
      category: 'LOG',
      ruleId: 'log/typescript',
      span: { startLine: 10, endLine: 10, lines: ['code line 10'] },
      explanation: 'Windowed context',
      confidence: 1.0,
    }

    const { lastFrame } = render(<DiffPreview item={item} cwd={tmpDir} maxLines={5} />)
    const frame = lastFrame() || ''
    expect(frame).toContain('code line 8')
    expect(frame).toContain('code line 10')
    expect(frame).toContain('code line 12')
    expect(frame).not.toContain('code line 7')
    expect(frame).not.toContain('code line 13')
    expect(frame).not.toContain('code line 20')
  })

  it('should handle unreadable scratch files gracefully with catch fallback', () => {
    const unreadablePath = join(tmpDir, 'unreadable.tmp')
    mkdirSync(unreadablePath) // Reading a directory with readFileSync throws EISDIR
    const item: MiasmaItem = {
      id: 'scratch-err',
      filePath: 'unreadable.tmp',
      category: 'SCRATCH',
      ruleId: 'scratch/untracked',
      explanation: 'Error file',
      confidence: 1.0,
    }

    const { lastFrame } = render(<DiffPreview item={item} cwd={tmpDir} />)
    const frame = lastFrame() || ''
    expect(frame).toContain('(binary or unreadable file)')
  })
})
