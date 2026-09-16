/**
 * A source line paired with the terminator that followed it.
 *
 * Keeping the terminator per line is what lets a file with mixed endings, or
 * with no final newline, survive a purge byte for byte.
 */
export interface PhysicalLine {
  content: string
  terminator: string
}

/**
 * A 1-indexed, inclusive range of lines.
 */
export interface LineRange {
  startLine: number
  endLine: number
}

/**
 * Splits raw file content into lines, preserving each line's own terminator.
 *
 * @param raw - The file's full contents.
 * @returns One entry per line; a final entry with an empty terminator means the file had no trailing newline.
 */
export function splitLines(raw: string): PhysicalLine[] {
  if (raw === '') return []

  const lines: PhysicalLine[] = []
  const pattern = /\r\n|\r|\n/g
  let cursor = 0
  let match = pattern.exec(raw)

  while (match !== null) {
    lines.push({ content: raw.slice(cursor, match.index), terminator: match[0] })
    cursor = match.index + match[0].length
    match = pattern.exec(raw)
  }

  if (cursor < raw.length) {
    lines.push({ content: raw.slice(cursor), terminator: '' })
  }

  return lines
}

/**
 * Rejoins lines, restoring each line's own terminator.
 *
 * @param lines - Lines to join.
 * @returns The reassembled file contents.
 */
export function joinLines(lines: PhysicalLine[]): string {
  return lines.map((l) => `${l.content}${l.terminator}`).join('')
}

/**
 * Normalises ranges into a descending, non-overlapping list.
 *
 * Only a genuine overlap is merged, so the same original line is never
 * spliced out twice. Adjacent-but-disjoint ranges are deliberately left
 * separate: each is still processed, in descending order, against the state
 * left by every range after it, so a blank line freed up by one range is
 * already in place by the time the next range's local tidy check runs. That
 * makes an explicit adjacency merge redundant, not merely inconvenient: a
 * prior version of this function tried to also merge on adjacency, but
 * required overlap in the same breath, so the adjacency arm never fired.
 *
 * @param ranges - Ranges as given, in any order, possibly overlapping.
 * @returns Merged ranges, highest start line first.
 */
function mergeRanges(ranges: LineRange[]): LineRange[] {
  const sorted = [...ranges].sort((a, b) => a.startLine - b.startLine)
  const merged: LineRange[] = []

  for (const range of sorted) {
    const last = merged[merged.length - 1]

    if (last && range.startLine <= last.endLine) {
      last.endLine = Math.max(last.endLine, range.endLine)
    } else {
      merged.push({ ...range })
    }
  }

  return merged.reverse()
}

/**
 * Removes the given line ranges, touching nothing else, and reports exactly
 * which original line numbers are gone.
 *
 * The only tidying applied is local: when a removal leaves a blank line
 * immediately above and immediately below the gap, one of them is dropped.
 * Blank runs elsewhere in the file are none of this function's business. The
 * returned line-number set covers both the requested ranges and any such
 * tidy drop, so a caller can check the outcome against precisely what was
 * removed instead of guessing a tolerance.
 *
 * @param lines - The file's lines.
 * @param ranges - 1-indexed inclusive ranges to remove.
 * @returns The remaining lines, and the exact original line numbers removed.
 */
export function planRemoval(
  lines: PhysicalLine[],
  ranges: LineRange[],
): { remaining: PhysicalLine[]; removedLineNumbers: Set<number> } {
  const out = lines.map((line, idx) => ({ line, originalLineNumber: idx + 1 }))
  const removedLineNumbers = new Set<number>()

  for (const range of mergeRanges(ranges)) {
    const start = range.startLine - 1
    const end = range.endLine - 1

    if (start < 0 || start >= out.length) continue

    const count = Math.min(end, out.length - 1) - start + 1
    for (const cut of out.splice(start, count)) removedLineNumbers.add(cut.originalLineNumber)

    const above = out[start - 1]
    const below = out[start]

    if (above && below && above.line.content.trim() === '' && below.line.content.trim() === '') {
      const [dropped] = out.splice(start, 1)
      if (dropped) removedLineNumbers.add(dropped.originalLineNumber)
    }
  }

  return { remaining: out.map((entry) => entry.line), removedLineNumbers }
}

/**
 * Removes the given line ranges, touching nothing else.
 *
 * A thin wrapper over {@link planRemoval} for callers that only need the
 * resulting lines, not the exact set of what was removed.
 *
 * @param lines - The file's lines.
 * @param ranges - 1-indexed inclusive ranges to remove.
 * @returns The remaining lines.
 */
export function removeRanges(lines: PhysicalLine[], ranges: LineRange[]): PhysicalLine[] {
  return planRemoval(lines, ranges).remaining
}
