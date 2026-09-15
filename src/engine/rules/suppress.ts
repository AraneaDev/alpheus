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
 * Compiler and linter suppression directives that silence a warning instead
 * of fixing it.
 */
export const suppressRules: Rule[] = [
  {
    id: 'suppress/eslint',
    category: 'SUPPRESS',
    languages: ['typescript', 'javascript'],
    match: suppressLineMatcher(1.0, ['ESLint rule suppression comment']),
  },
  {
    id: 'suppress/ts',
    category: 'SUPPRESS',
    languages: ['typescript', 'javascript'],
    match: suppressLineMatcher(1.0, ['TypeScript compiler error suppression comment']),
  },
  {
    id: 'suppress/biome',
    category: 'SUPPRESS',
    languages: ['typescript', 'javascript'],
    match: suppressLineMatcher(1.0, ['Biome linter suppression comment']),
  },
  {
    id: 'suppress/prettier',
    category: 'SUPPRESS',
    languages: ['typescript', 'javascript'],
    match: suppressLineMatcher(1.0, ['Prettier formatting suppression comment']),
  },
  {
    id: 'suppress/python',
    category: 'SUPPRESS',
    languages: ['python'],
    match: suppressLineMatcher(1.0),
  },
  {
    id: 'suppress/rust',
    category: 'SUPPRESS',
    languages: ['rust'],
    match: suppressLineMatcher(1.0),
  },
  {
    id: 'suppress/go',
    category: 'SUPPRESS',
    languages: ['go'],
    match: suppressLineMatcher(1.0),
  },
  {
    id: 'suppress/php',
    category: 'SUPPRESS',
    languages: ['php'],
    match: suppressLineMatcher(1.0),
  },
]
