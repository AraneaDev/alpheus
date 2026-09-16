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

  it('leaves a blank below untouched when the line above the gap is not blank', () => {
    // Only the below side is blank here; the tidy is defined to fire on a
    // blank on both sides of the gap, not either side alone.
    const raw = 'a\nDELETE\n\nb\n'
    const out = joinLines(removeRanges(splitLines(raw), [{ startLine: 2, endLine: 2 }]))
    expect(out).toBe('a\n\nb\n')
  })

  it('leaves a non-blank line below untouched when only the line above the gap is blank', () => {
    // The mirror case: above is blank but below is real content. A check
    // that only inspects the above side would drop "b" here by mistake.
    const raw = 'a\n\nDELETE\nb\n'
    const out = joinLines(removeRanges(splitLines(raw), [{ startLine: 3, endLine: 3 }]))
    expect(out).toBe('a\n\nb\n')
  })

  it('removes the file\'s first line without the off-by-one skipping it', () => {
    const raw = 'DELETE\nb\nc\n'
    const out = joinLines(removeRanges(splitLines(raw), [{ startLine: 1, endLine: 1 }]))
    expect(out).toBe('b\nc\n')
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

  it('ignores a range with startLine 0 instead of deleting the last line', () => {
    // startLine: 0 makes `start` (startLine - 1) equal -1. Without the
    // `start < 0` guard, `out.splice(-1, count)` would silently delete the
    // *last* line of the file, since a negative index to splice counts back
    // from the end. Assert the full string, not just its length, so a
    // wrong-line deletion can't slip past.
    const raw = 'a\nb\nc\n'
    const out = joinLines(removeRanges(splitLines(raw), [{ startLine: 0, endLine: 0 }]))
    expect(out).toBe(raw)
  })

  it('ignores a range with a negative startLine instead of deleting from the end', () => {
    const raw = 'a\nb\nc\n'
    const out = joinLines(removeRanges(splitLines(raw), [{ startLine: -5, endLine: -5 }]))
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
