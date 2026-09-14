import { describe, expect, it } from 'bun:test'
import { matchScratchFile } from '../src/engine/rules/scratch.ts'
import { matchTombstoneBlocks } from '../src/engine/rules/tombstone.ts'

describe('Miasma Rule: [SCRATCH]', () => {
  it('should detect temporary and scratch files in root and scratch dirs', () => {
    expect(matchScratchFile('scratch.py')).toBe('Untracked scratch or temporary file')
    expect(matchScratchFile('SCRATCH.PY')).toBe('Untracked scratch or temporary file')
    expect(matchScratchFile('scratch-notes.txt')).toBe('Untracked scratch or temporary file')
    expect(matchScratchFile('scratch_notes.txt')).toBe('Untracked scratch or temporary file')
    expect(matchScratchFile('temp.json')).toBe('Untracked scratch or temporary file')
    expect(matchScratchFile('tmp-work.txt')).toBe('Untracked scratch or temporary file')
    expect(matchScratchFile('tmp.data')).toBe('Untracked scratch or temporary file')
    expect(matchScratchFile('scratch/temp.json')).toBe('Untracked scratch or temporary file')
    expect(matchScratchFile('tmp/temp.data')).toBe('Untracked scratch or temporary file')
    expect(matchScratchFile('.scratch/scratch.py')).toBe('Untracked scratch or temporary file')
  })

  it('should detect diagnostic dumps, throwaway scripts, and explicit extensions anywhere', () => {
    expect(matchScratchFile('dump.json')).toBe('Untracked diagnostic dump or log file')
    expect(matchScratchFile('test_payload.json')).toBe('Untracked diagnostic dump or log file')
    expect(matchScratchFile('payload.txt')).toBe('Untracked diagnostic dump or log file')
    expect(matchScratchFile('response.log')).toBe('Untracked diagnostic dump or log file')
    expect(matchScratchFile('debug.log')).toBe('Untracked diagnostic dump or log file')
    expect(matchScratchFile('out.sql')).toBe('Untracked diagnostic dump or log file')

    expect(matchScratchFile('t.py')).toBe('Untracked throwaway script')
    expect(matchScratchFile('test.ts')).toBe('Untracked throwaway script')
    expect(matchScratchFile('foo.js')).toBe('Untracked throwaway script')
    expect(matchScratchFile('bar.sh')).toBe('Untracked throwaway script')
    expect(matchScratchFile('baz.php')).toBe('Untracked throwaway script')
    expect(matchScratchFile('temp.rb')).toBe('Untracked scratch or temporary file')

    // Extensions apply anywhere
    expect(matchScratchFile('src/deep/cache.tmp')).toBe('Untracked temporary file extension')
    expect(matchScratchFile('src/deep/notes.scratch')).toBe('Untracked temporary file extension')
    expect(matchScratchFile('src/deep/old.bak')).toBe('Untracked temporary file extension')
  })

  it('should ignore legitimate source and test files in subdirectories and non-matching prefixes', () => {
    expect(matchScratchFile('src/components/temperature.ts')).toBeNull()
    expect(matchScratchFile('src/nested/dump.json')).toBeNull()
    expect(matchScratchFile('src/nested/t.py')).toBeNull()
    expect(matchScratchFile('src/nested/foo.js')).toBeNull()
    expect(matchScratchFile('src/nested/scratch_data.txt')).toBeNull()
    expect(matchScratchFile('test/scanner.test.ts')).toBeNull()
    expect(matchScratchFile('docs/specs/design.md')).toBeNull()
    expect(matchScratchFile('package.json')).toBeNull()

    // Prefix/suffix non-matches
    expect(matchScratchFile('scratchy.txt')).toBeNull()
    expect(matchScratchFile('dumpster.json')).toBeNull()
    expect(matchScratchFile('testing.ts')).toBeNull()
    expect(matchScratchFile('football.js')).toBeNull()
    expect(matchScratchFile('my_dump.json')).toBeNull()
    expect(matchScratchFile('test.txt')).toBeNull()
    expect(matchScratchFile('cache.tmp_extra')).toBeNull()
    expect(matchScratchFile('archive.bak2')).toBeNull()

    // Regex anchor boundaries ($ and ^)
    expect(matchScratchFile('dump.json.extra')).toBeNull()
    expect(matchScratchFile('debug.log.bak1')).toBeNull()
    expect(matchScratchFile('t.py.backup')).toBeNull()
    expect(matchScratchFile('test.ts.extra')).toBeNull()
    expect(matchScratchFile('attest.ts')).toBeNull()
    expect(matchScratchFile('myfoo.js')).toBeNull()
    expect(matchScratchFile('barb.sh')).toBeNull()
  })

  it('should handle uppercase names and extensions', () => {
    expect(matchScratchFile('TEMP.JSON')).toBe('Untracked scratch or temporary file')
    expect(matchScratchFile('DUMP.LOG')).toBe('Untracked diagnostic dump or log file')
    expect(matchScratchFile('FOO.JS')).toBe('Untracked throwaway script')
    expect(matchScratchFile('CACHE.TMP')).toBe('Untracked temporary file extension')
    expect(matchScratchFile('ARCHIVE.BAK')).toBe('Untracked temporary file extension')
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
    expect(tombstones[0].explanation).toBe('Commented-out dead code block (3 lines)')
  })

  it('should not flag blocks shorter than 3 lines as tombstones', () => {
    const singleLine = [{ lineNumber: 5, content: '// const x = 1;' }]
    expect(matchTombstoneBlocks(singleLine, 'typescript').length).toBe(0)

    const twoLines = [
      { lineNumber: 5, content: '// const x = 1;' },
      { lineNumber: 6, content: '// return x;' },
    ]
    expect(matchTombstoneBlocks(twoLines, 'typescript').length).toBe(0)
  })

  it('should detect when exactly 2 of 3 lines are code-like', () => {
    const lines = [
      { lineNumber: 20, content: '// Explanation of the variable' },
      { lineNumber: 21, content: '// const total = count * rate;' },
      { lineNumber: 22, content: '// return total;' },
    ]
    const tombstones = matchTombstoneBlocks(lines, 'typescript')
    expect(tombstones.length).toBe(1)
  })

  it('should ignore 3-line comment blocks where fewer than 2 lines resemble code', () => {
    const lines = [
      { lineNumber: 20, content: '// Header notes regarding this module' },
      { lineNumber: 21, content: '// Details explaining how to use this' },
      { lineNumber: 22, content: '// const x = 1;' },
    ]
    const tombstones = matchTombstoneBlocks(lines, 'typescript')
    expect(tombstones.length).toBe(0)
  })

  it('should support python hash and sql/lua dash-dash comments with whitespace', () => {
    const pyLines = [
      { lineNumber: 1, content: '   # def calculate(a, b):' },
      { lineNumber: 2, content: '   #     val = a + b' },
      { lineNumber: 3, content: '   #     return val' },
    ]
    const pyTombstones = matchTombstoneBlocks(pyLines, 'python')
    expect(pyTombstones.length).toBe(1)

    const sqlLines = [
      { lineNumber: 10, content: '  -- SELECT count(*) FROM users;' },
      { lineNumber: 11, content: '  -- SET status = "inactive";' },
      { lineNumber: 12, content: '  -- UPDATE accounts SET balance = 0;' },
    ]
    const sqlTombstones = matchTombstoneBlocks(sqlLines, 'unknown')
    expect(sqlTombstones.length).toBe(1)
  })

  it('should detect zero-argument function calls and variable assignments without surrounding spaces', () => {
    const compactSyntax = [
      { lineNumber: 1, content: '//resetState()' },
      { lineNumber: 2, content: '//count=0' },
      { lineNumber: 3, content: '//runWorker ()' },
    ]
    const tombstones = matchTombstoneBlocks(compactSyntax, 'typescript')
    expect(tombstones.length).toBe(1)
    expect(tombstones[0].startLine).toBe(1)
    expect(tombstones[0].endLine).toBe(3)
  })

  it('should detect multiple separate tombstone blocks separated by code or line gaps', () => {
    const linesWithGap = [
      { lineNumber: 1, content: '// const a = 1;' },
      { lineNumber: 2, content: '// const b = 2;' },
      { lineNumber: 3, content: '// return a + b;' },
      // gap: line 4 is missing, non-contiguous
      { lineNumber: 10, content: '// const x = 10;' },
      { lineNumber: 11, content: '// const y = 20;' },
      { lineNumber: 12, content: '// return x + y;' },
    ]
    const gapTombstones = matchTombstoneBlocks(linesWithGap, 'typescript')
    expect(gapTombstones.length).toBe(2)
    expect(gapTombstones[0].startLine).toBe(1)
    expect(gapTombstones[0].endLine).toBe(3)
    expect(gapTombstones[1].startLine).toBe(10)
    expect(gapTombstones[1].endLine).toBe(12)

    const linesWithActiveCode = [
      { lineNumber: 1, content: '// const a = 1;' },
      { lineNumber: 2, content: '// const b = 2;' },
      { lineNumber: 3, content: '// return a + b;' },
      { lineNumber: 4, content: 'const liveCode = true;' },
      { lineNumber: 5, content: '// const x = 10;' },
      { lineNumber: 6, content: '// const y = 20;' },
      { lineNumber: 7, content: '// return x + y;' },
    ]
    const activeTombstones = matchTombstoneBlocks(linesWithActiveCode, 'typescript')
    expect(activeTombstones.length).toBe(2)
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

  it('should handle non-contiguous commented lines correctly without forming blocks', () => {
    const lines = [
      { lineNumber: 10, content: '// const x = 1;' },
      { lineNumber: 12, content: '// const y = 2;' },
      { lineNumber: 14, content: '// const z = 3;' },
    ]
    const tombstones = matchTombstoneBlocks(lines, 'typescript')
    expect(tombstones.length).toBe(0)
  })
})
