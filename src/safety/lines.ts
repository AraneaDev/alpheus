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
 * @param ranges - Ranges as given, in any order, possibly overlapping.
 * @returns Merged ranges, highest start line first.
 */
function mergeRanges(ranges: LineRange[]): LineRange[] {
  const sorted = [...ranges].sort((a, b) => a.startLine - b.startLine)
  const merged: LineRange[] = []

  for (const range of sorted) {
    const last = merged[merged.length - 1]

    if (last && range.startLine <= last.endLine + 1 && range.startLine <= last.endLine) {
      last.endLine = Math.max(last.endLine, range.endLine)
    } else {
      merged.push({ ...range })
    }
  }

  return merged.reverse()
}

/**
 * Removes the given line ranges, touching nothing else.
 *
 * The only tidying applied is local: when a removal leaves a blank line
 * immediately above and immediately below the gap, one of them is dropped.
 * Blank runs elsewhere in the file are none of this function's business.
 *
 * @param lines - The file's lines.
 * @param ranges - 1-indexed inclusive ranges to remove.
 * @returns The remaining lines.
 */
export function removeRanges(lines: PhysicalLine[], ranges: LineRange[]): PhysicalLine[] {
  const out = [...lines]

  for (const range of mergeRanges(ranges)) {
    const start = range.startLine - 1
    const end = range.endLine - 1

    if (start < 0 || start >= out.length) continue

    const count = Math.min(end, out.length - 1) - start + 1
    out.splice(start, count)

    const above = out[start - 1]
    const below = out[start]

    if (above && below && above.content.trim() === '' && below.content.trim() === '') {
      out.splice(start, 1)
    }
  }

  return out
}
