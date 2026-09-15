import { createHash } from 'crypto'
import type { MiasmaCategory } from '../scanner/types.ts'

/**
 * Builds a stable, content-addressed identifier for a finding.
 *
 * Two findings that describe the same text at the same place in the same file
 * get the same id, which is what collapses the duplicate a staged and an
 * unstaged diff both report. Two findings that differ in any of those never
 * collide, which is what keeps TUI selection and React keys correct.
 *
 * @param category - The miasma category of the finding.
 * @param filePath - Repository-relative path to the file.
 * @param startLine - 1-indexed first line of the span.
 * @param lines - Exact untrimmed text of every line in the span.
 * @returns A readable, collision-resistant identifier.
 */
export function makeFindingId(
  category: MiasmaCategory,
  filePath: string,
  startLine: number,
  lines: string[],
): string {
  const digest = createHash('sha256')
    .update(`${filePath} ${startLine} ${lines.join(' ')}`)
    .digest('hex')
    .slice(0, 12)

  return `${category.toLowerCase()}-${digest}`
}
