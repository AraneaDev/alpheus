import type { SupportedLanguage } from '../language.ts'
import type { MatchContext, Rule, RuleMatch } from './types.ts'

/**
 * Checks whether an added line introduces a compiler/linter suppression directive.
 *
 * @param line - The raw content of the added line.
 * @param lang - The language of the file.
 * @returns An explanation string if matched, or null if clean.
 */
export function matchSuppressMiasma(line: string, lang: SupportedLanguage): string | null {
  const trimmed = line.trim()

  switch (lang) {
    case 'typescript':
    case 'javascript': {
      if (/eslint-disable(?:-next-line|-line)?\b/.test(trimmed)) {
        return 'ESLint rule suppression comment'
      }
      if (/@ts-(?:ignore|expect-error|nocheck)\b/.test(trimmed)) {
        return 'TypeScript compiler error suppression comment'
      }
      if (/biome-ignore\b/.test(trimmed)) {
        return 'Biome linter suppression comment'
      }
      if (/prettier-ignore\b/.test(trimmed)) {
        return 'Prettier formatting suppression comment'
      }
      return null
    }

    case 'python': {
      if (/#\s*noqa\b/i.test(trimmed)) {
        return 'Python flake8/ruff noqa suppression comment'
      }
      if (/#\s*type:\s*ignore\b/i.test(trimmed)) {
        return 'Python type checker (mypy/pyright) suppression comment'
      }
      return null
    }

    case 'rust': {
      if (/#\[allow\((?:unused_|dead_code|clippy::)/.test(trimmed)) {
        return 'Rust compiler or clippy lint allowance attribute'
      }
      return null
    }

    case 'go': {
      if (/\/\/\s*nolint(?::|\s|$)/.test(trimmed)) {
        return 'Go linter suppression comment'
      }
      return null
    }

    case 'php': {
      if (/@(?:phpstan|psalm)-(?:ignore|suppress)/.test(trimmed)) {
        return 'PHP static analysis suppression comment'
      }
      return null
    }

    default:
      return null
  }
}

/**
 * Builds a rule `match` function that runs `matchSuppressMiasma` over every
 * line of a context, keeping only the explanations named in `only` when it
 * is given.
 *
 * TypeScript and JavaScript share one switch case with four distinct
 * suppression directives (ESLint, the compiler, Biome, Prettier), so a rule
 * narrows to its own slice of that case's output by the exact explanation
 * text it returns.
 *
 * @param confidence - The confidence to report for a match.
 * @param only - The explanation strings this rule owns, or omit to accept any.
 * @returns A `Rule['match']` implementation.
 */
function suppressLineMatcher(
  confidence: number,
  only?: string[],
): (ctx: MatchContext) => RuleMatch[] {
  return (ctx) => {
    const out: RuleMatch[] = []

    for (const line of ctx.lines) {
      const explanation = matchSuppressMiasma(line.content, ctx.lang)
      if (explanation && (!only || only.includes(explanation))) {
        out.push({
          startLine: line.lineNumber,
          endLine: line.lineNumber,
          explanation,
          confidence,
        })
      }
    }

    return out
  }
}

/**
 * TypeScript suppression directives, each scored by how often silencing the
 * compiler this way turns out to be lazy rather than load-bearing.
 *
 * `@ts-expect-error` errors when it turns out to be unnecessary, so leaving
 * it in place is usually deliberate. `@ts-ignore` and `@ts-nocheck` never
 * error back, so nothing catches them once the error they were guarding
 * against is fixed.
 */
const TS_DIRECTIVES: { pattern: RegExp; confidence: number; explanation: string }[] = [
  {
    pattern: /@ts-ignore\b/,
    confidence: 0.9,
    explanation: 'TypeScript error suppression comment',
  },
  {
    pattern: /@ts-nocheck\b/,
    confidence: 0.9,
    explanation: 'TypeScript whole-file check suppression',
  },
  {
    // Unlike @ts-ignore, this errors when it is unnecessary, so it is usually
    // load-bearing rather than lazy.
    pattern: /@ts-expect-error\b/,
    confidence: 0.4,
    explanation: 'TypeScript expected-error comment, check whether it is still needed',
  },
]

/**
 * Scores each `@ts-*` suppression comment by directive instead of stamping
 * every TypeScript suppression with one shared confidence.
 *
 * @param ctx - The hunk's added lines and language.
 * @returns One match per directive found, each with its own confidence.
 */
function matchTsDirectives(ctx: MatchContext): RuleMatch[] {
  const out: RuleMatch[] = []

  for (const line of ctx.lines) {
    for (const directive of TS_DIRECTIVES) {
      if (directive.pattern.test(line.content)) {
        out.push({
          startLine: line.lineNumber,
          endLine: line.lineNumber,
          explanation: directive.explanation,
          confidence: directive.confidence,
        })
        break
      }
    }
  }

  return out
}

/**
 * Compiler and linter suppression directives that silence a warning instead
 * of fixing it.
 */
export const suppressRules: Rule[] = [
  {
    id: 'suppress/eslint',
    category: 'SUPPRESS',
    languages: ['typescript', 'javascript'],
    match: suppressLineMatcher(0.9, ['ESLint rule suppression comment']),
  },
  {
    id: 'suppress/ts',
    category: 'SUPPRESS',
    languages: ['typescript', 'javascript'],
    match: matchTsDirectives,
  },
  {
    // Same category of "silence the linter instead of fixing it" as
    // eslint-disable, so it gets the same confidence.
    id: 'suppress/biome',
    category: 'SUPPRESS',
    languages: ['typescript', 'javascript'],
    match: suppressLineMatcher(0.9, ['Biome linter suppression comment']),
  },
  {
    // prettier-ignore skips auto-formatting, not an error or lint warning; it
    // is routinely used on purpose to keep a hand-aligned table or generated
    // block from being reformatted, so it reads as load-bearing more often
    // than lazy.
    id: 'suppress/prettier',
    category: 'SUPPRESS',
    languages: ['typescript', 'javascript'],
    match: suppressLineMatcher(0.4, ['Prettier formatting suppression comment']),
  },
  {
    id: 'suppress/python',
    category: 'SUPPRESS',
    languages: ['python'],
    match: suppressLineMatcher(0.85),
  },
  {
    id: 'suppress/rust',
    category: 'SUPPRESS',
    languages: ['rust'],
    match: suppressLineMatcher(0.7),
  },
  {
    id: 'suppress/go',
    category: 'SUPPRESS',
    languages: ['go'],
    match: suppressLineMatcher(0.85),
  },
  {
    id: 'suppress/php',
    category: 'SUPPRESS',
    languages: ['php'],
    match: suppressLineMatcher(0.85),
  },
]
