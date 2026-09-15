import type { SupportedLanguage } from '../language.ts'
import type { MatchContext, Rule, RuleMatch } from './types.ts'

/**
 * A detected block of commented-out dead code.
 */
export interface TombstoneBlock {
  startLine: number
  endLine: number
  explanation: string
  confidence: number
}

/**
 * Checks whether a trimmed line opens with a comment marker.
 *
 * `markdown` is excluded outright: a heading (`# Title`) opens with the same
 * character as a Python or shell comment, so a language-blind check here is
 * exactly how a markdown heading used to get read as commented-out code. No
 * markdown file reaches this rule in practice, since the tombstone rule's
 * `languages` list only names real programming languages, but the function
 * itself stays correct if called directly.
 *
 * The other languages stay permissive on purpose: `matchTombstoneBlocks` is
 * a general-purpose block scanner callable with any language, and every
 * marker below (`//`, `/*`, `#`, `--`) is unambiguous once markdown is ruled
 * out, none of them collide with another language's ordinary syntax.
 *
 * @param trimmed - The line, already trimmed of surrounding whitespace.
 * @param lang - The file's detected language.
 * @returns True if the line opens with a recognised comment marker.
 */
function isCommented(trimmed: string, lang: SupportedLanguage): boolean {
  if (lang === 'markdown') return false
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('--')
  )
}

/**
 * Strips a line's leading comment marker (and, for a `/* *\/` line, its
 * trailing one) so the remaining text can be scored on its own.
 *
 * @param text - The raw line content.
 * @returns The comment's text with its marker(s) removed.
 */
function stripCommentPrefix(text: string): string {
  return text
    .trim()
    .replace(/^(?:\/\/|\/\*|#|--)\s*/, '')
    .replace(/\s*\*\/$/, '')
}

/**
 * Scores one stripped comment line by how much it reads as code rather than prose.
 *
 * The old test matched the words `if`, `for` and `return`, which occur in
 * ordinary English at least as often as in source, so a doc comment read as a
 * dead block. Structure is the signal: punctuation that prose does not use, and
 * the absence of the punctuation that prose does. Keyword matching is anchored
 * to the start of the line, not `\b` anywhere in it, so "so that if the backend"
 * no longer reads as an `if` statement.
 *
 * @param text - A comment line with its marker already stripped.
 * @returns A score from 0 (clearly prose) to 1 (clearly code).
 */
function scoreCodeLikeness(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return 0

  let score = 0

  // Structural punctuation prose does not use.
  if (/[{}]/.test(trimmed)) score += 0.4
  if (/;\s*$/.test(trimmed)) score += 0.5
  if (/=>|->|::|\+\+|&&|\|\||[<>=!]=|[+\-*/%]=/.test(trimmed)) score += 0.35
  // A bare comparison, common in an `if` condition a brace-less language
  // (Python, shell) never wraps in parentheses.
  if (/\s[<>]\s/.test(trimmed)) score += 0.3
  if (/^[a-zA-Z_$][\w$.]*\s*=[^=]/.test(trimmed)) score += 0.4
  // Allows whitespace before the parenthesis so `runWorker ()` and a
  // parenthesised condition like `if (x > 0)` both read as call-shaped.
  if (/\b[a-zA-Z_$][\w$]*\s*\([^)]*\)/.test(trimmed)) score += 0.45
  if (/^\s*(?:const|let|var|def|func|fn|class|import|from|return|if|elif|for|while|else)\b/.test(trimmed)) {
    score += 0.55
  }
  // A bare `return`/`break`/`continue` followed by nothing but a single
  // identifier: too terse to be a sentence, common at the end of a function.
  if (/^\s*(?:return|break|continue|yield)\s+[A-Za-z_$][\w$.]*\s*$/i.test(trimmed)) score += 0.25
  if (/:\s*$/.test(trimmed)) score += 0.3
  // An identifier-like reference (a ticket key, a constant) rather than a
  // prose word: letters glued to digits with no space between them.
  if (/\b[A-Za-z]+-\d+\b/.test(trimmed)) score += 0.3

  // Prose signals, subtracted.
  const words = trimmed.split(/\s+/)
  if (/[.!?]$/.test(trimmed) && !/[;)}]$/.test(trimmed)) score -= 0.3
  if (words.length >= 8 && !/[{};=()]/.test(trimmed)) score -= 0.4
  if (/\b(?:the|and|because|whether|which|that|does not|is not)\b/i.test(trimmed)) score -= 0.25

  return Math.max(0, Math.min(1, score))
}

/**
 * Checks whether a series of lines contains a commented-out dead code block.
 *
 * @param lines - Array of lines with their line numbers and content.
 * @param lang - Programming language, used to decide which comment markers apply.
 * @returns Array of detected tombstone blocks.
 */
export function matchTombstoneBlocks(
  lines: { lineNumber: number; content: string }[],
  lang: SupportedLanguage,
): TombstoneBlock[] {
  const blocks: TombstoneBlock[] = []
  let currentBlock: { lineNumber: number; content: string }[] = []

  function flushBlock(): void {
    if (currentBlock.length >= 3) {
      const scores = currentBlock.map((line) => scoreCodeLikeness(stripCommentPrefix(line.content)))
      const average = scores.reduce((a, b) => a + b, 0) / scores.length

      // Below this the block reads as prose and is not worth reporting at all.
      if (average >= 0.38) {
        blocks.push({
          startLine: currentBlock[0].lineNumber,
          endLine: currentBlock[currentBlock.length - 1].lineNumber,
          explanation: `Commented-out dead code block (${currentBlock.length} lines)`,
          confidence: Math.max(0, Math.min(0.95, average)),
        })
      }
    }
    currentBlock = []
  }

  for (const line of lines) {
    if (!isCommented(line.content.trim(), lang)) {
      continue
    }

    if (currentBlock.length === 0) {
      currentBlock.push(line)
    } else {
      const prev = currentBlock[currentBlock.length - 1]
      // Check if contiguous line number
      if (line.lineNumber === prev.lineNumber + 1) {
        currentBlock.push(line)
      } else {
        flushBlock()
        currentBlock.push(line)
      }
    }
  }

  flushBlock()
  return blocks
}

/**
 * Commented-out dead code left behind instead of deleted.
 *
 * A single block rule: `matchTombstoneBlocks` scans a contiguous run of
 * lines rather than one line at a time, so it stays a block-level rule
 * regardless of language. Scoped to real programming languages so that a
 * markdown heading or a YAML key can never be read as a comment.
 */
export const tombstoneRules: Rule[] = [
  {
    id: 'tombstone/block',
    category: 'TOMBSTONE',
    languages: ['typescript', 'javascript', 'python', 'rust', 'go', 'php', 'shell'],
    match(ctx: MatchContext): RuleMatch[] {
      return matchTombstoneBlocks(ctx.lines, ctx.lang).map((block) => ({
        startLine: block.startLine,
        endLine: block.endLine,
        explanation: block.explanation,
        confidence: block.confidence,
      }))
    },
  },
]
