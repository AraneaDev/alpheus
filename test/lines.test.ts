import { describe, expect, it } from 'bun:test'
import { joinLines, removeRanges, splitLines } from '../src/safety/lines.ts'

describe('splitLines and joinLines', () => {
  it('round-trips a plain LF file', () => {
    const raw = 'a\nb\nc\n'
    expect(joinLines(splitLines(raw))).toBe(raw)
  })

  it('round-trips a file with no trailing newline', () => {
    const raw = 'a\nb\nc'
    expect(joinLines(splitLines(raw))).toBe(raw)
  })

  it('round-trips a CRLF file', () => {
    const raw = 'a\r\nb\r\n'
    expect(joinLines(splitLines(raw))).toBe(raw)
  })

  it('round-trips mixed line endings without normalising them', () => {
    const raw = 'a\r\nb\nc\r\n'
    expect(joinLines(splitLines(raw))).toBe(raw)
  })

  it('round-trips an empty file', () => {
    expect(joinLines(splitLines(''))).toBe('')
  })
})

describe('removeRanges', () => {
  it('removes a single line and leaves every other byte alone', () => {
    const raw = 'a\n\n\nb\nDELETE\nc\n\n\nd\n'
    const out = joinLines(removeRanges(splitLines(raw), [{ startLine: 5, endLine: 5 }]))
    expect(out).toBe('a\n\n\nb\nc\n\n\nd\n')
  })

  it('removes a multi-line range', () => {
    const raw = 'a\nx\ny\nz\nb\n'
    const out = joinLines(removeRanges(splitLines(raw), [{ startLine: 2, endLine: 4 }]))
    expect(out).toBe('a\nb\n')
  })

  it('removes several ranges regardless of the order given', () => {
    const raw = 'a\nb\nc\nd\ne\n'
    const out = joinLines(
      removeRanges(splitLines(raw), [
        { startLine: 4, endLine: 4 },
        { startLine: 2, endLine: 2 },
      ]),
    )
    expect(out).toBe('a\nc\ne\n')
  })

  it('merges overlapping ranges instead of double-removing', () => {
    const raw = 'a\nb\nc\nd\ne\n'
    const out = joinLines(
      removeRanges(splitLines(raw), [
        { startLine: 2, endLine: 3 },
        { startLine: 3, endLine: 4 },
      ]),
    )
    expect(out).toBe('a\ne\n')
  })

  it('drops one blank when a removal leaves a blank above and below', () => {
    const raw = 'a\n\nDELETE\n\nb\n'
    const out = joinLines(removeRanges(splitLines(raw), [{ startLine: 3, endLine: 3 }]))
    expect(out).toBe('a\n\nb\n')
  })

  it('leaves intentional double blanks elsewhere untouched', () => {
    const raw = 'import os\n\n\ndef alpha():\n    print("dbg")\n    return 1\n\n\ndef beta():\n    return 2\n'
    const out = joinLines(removeRanges(splitLines(raw), [{ startLine: 5, endLine: 5 }]))
    expect(out).toBe('import os\n\n\ndef alpha():\n    return 1\n\n\ndef beta():\n    return 2\n')
  })

  it('ignores out-of-bounds ranges', () => {
    const raw = 'a\nb\n'
    const out = joinLines(removeRanges(splitLines(raw), [{ startLine: 99, endLine: 99 }]))
    expect(out).toBe(raw)
  })

  it('treats two adjacent single-line ranges as one gap for blank tidying', () => {
    // Lines 2 and 3 are adjacent but given as separate, non-overlapping
    // ranges. Removing both should still collapse the blank left above and
    // below the combined gap to one, exactly as a single {2,3} range would.
    const raw = 'a\n\nDEL1\nDEL2\n\nb\n'
    const out = joinLines(
      removeRanges(splitLines(raw), [
        { startLine: 3, endLine: 3 },
        { startLine: 4, endLine: 4 },
      ]),
    )
    expect(out).toBe('a\n\nb\n')
  })
})
