import { describe, expect, it } from 'bun:test'
import { matchScratchFile } from '../src/engine/rules/scratch.ts'
import { matchTombstoneBlocks } from '../src/engine/rules/tombstone.ts'

describe('Miasma Rule: [SCRATCH]', () => {
  it('should detect temporary and scratch files', () => {
    expect(matchScratchFile('scratch.py')).not.toBeNull()
    expect(matchScratchFile('temp.json')).not.toBeNull()
    expect(matchScratchFile('debug.log')).not.toBeNull()
    expect(matchScratchFile('dump.json')).not.toBeNull()
    expect(matchScratchFile('t.py')).not.toBeNull()
    expect(matchScratchFile('foo.js')).not.toBeNull()
    expect(matchScratchFile('test.ts')).not.toBeNull() // Untracked root test script
  })

  it('should ignore legitimate source and test files in subdirectories', () => {
    expect(matchScratchFile('src/components/temperature.ts')).toBeNull()
    expect(matchScratchFile('test/scanner.test.ts')).toBeNull()
    expect(matchScratchFile('docs/specs/design.md')).toBeNull()
    expect(matchScratchFile('package.json')).toBeNull()
  })
})

describe('Miasma Rule: [TOMBSTONE]', () => {
  it('should detect 3+ lines of commented-out dead code', () => {
    const lines = [
      { lineNumber: 10, content: '// const oldToken = user.token;' },
      { lineNumber: 11, content: '// if (!oldToken) return false;' },
      { lineNumber: 12, content: '// return oldToken.isValid();' },
    ]
    const tombstones = matchTombstoneBlocks(lines, 'typescript')
    expect(tombstones.length).toBe(1)
    expect(tombstones[0].startLine).toBe(10)
    expect(tombstones[0].endLine).toBe(12)
  })

  it('should ignore natural language comments and documentation', () => {
    const lines = [
      { lineNumber: 10, content: '// This is an explanation of the algorithm.' },
      { lineNumber: 11, content: '// It calculates the checksum across all bytes' },
      { lineNumber: 12, content: '// and verifies the signature matches.' },
    ]
    const tombstones = matchTombstoneBlocks(lines, 'typescript')
    expect(tombstones.length).toBe(0)
  })

  it('should handle non-contiguous commented lines correctly', () => {
    const lines = [
      { lineNumber: 10, content: '// const x = 1;' },
      { lineNumber: 20, content: '// const y = 2;' },
    ]
    const tombstones = matchTombstoneBlocks(lines, 'typescript')
    expect(tombstones.length).toBe(0)
  })
})
