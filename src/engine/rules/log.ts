import type { SupportedLanguage } from '../language.ts'
import type { MatchContext, Rule, RuleMatch } from './types.ts'

/**
 * Checks whether an added line contains an ephemeral debug log statement.
 *
 * @param line - The raw content of the added line.
 * @param lang - The language of the file.
 * @returns An explanation string if matched, or null if clean.
 */
export function matchLogMiasma(line: string, lang: SupportedLanguage): string | null {
  const trimmed = line.trim()

  // Ignore commented lines (tombstone rule handles dead code)
  if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
    return null
  }

  // Helper to ensure pattern isn't just inside a string literal assignment
  function isFunctionCall(pattern: RegExp): boolean {
    return pattern.test(trimmed)
  }

  switch (lang) {
    case 'typescript':
    case 'javascript': {
      if (isFunctionCall(/^(?:await\s+)?console\.(?:log|debug|dir|time|timeEnd)\s*\(/)) {
        return 'Ephemeral JavaScript/TypeScript console statement'
      }
      // Also match inline calls e.g. "x = foo(); console.log(x)"
      if (isFunctionCall(/;\s*console\.(?:log|debug|dir|time|timeEnd)\s*\(/)) {
        return 'Ephemeral JavaScript/TypeScript console statement'
      }
      return null
    }

    case 'python': {
      if (isFunctionCall(/^(?:[a-zA-Z0-9_.]+\s*=\s*)?print\s*\(/)) {
        return 'Ephemeral Python print statement'
      }
      if (isFunctionCall(/^(?:breakpoint|pdb\.set_trace|ipdb\.set_trace)\s*\(/)) {
        return 'Active Python debugger breakpoint'
      }
      if (isFunctionCall(/^logging\.debug\s*\(/)) {
        return 'Temporary Python logging.debug call'
      }
      return null
    }

    case 'rust': {
      if (isFunctionCall(/dbg!\s*\(/)) {
        return 'Ephemeral Rust dbg! macro call'
      }
      if (isFunctionCall(/println!\s*\(/)) {
        return 'Ephemeral Rust println! macro call'
      }
      return null
    }

    case 'go': {
      if (isFunctionCall(/fmt\.Print(?:ln|f)\s*\(/)) {
        return 'Ephemeral Go fmt.Print statement'
      }
      if (isFunctionCall(/log\.Print(?:ln|f)\s*\(/)) {
        return 'Ephemeral Go log.Print statement'
      }
      return null
    }

    case 'php': {
      if (isFunctionCall(/(?:var_dump|print_r|dump|dd)\s*\(/)) {
        return 'Ephemeral PHP dump function call'
      }
      return null
    }

    case 'shell': {
      if (/^set\s+-x\b/.test(trimmed)) {
        return 'Active Shell execution trace (set -x)'
      }
      if (/^echo\s+["']DEBUG:/i.test(trimmed)) {
        return 'Ephemeral Shell debug echo'
      }
      return null
    }

    default:
      return null
  }
}

/**
 * Builds a rule `match` function that runs `matchLogMiasma` over every line of
 * a context, keeping only the explanations named in `only` when it is given.
 *
 * Several distinct log patterns share one language and one underlying
 * function (Python has print, breakpoint and logging.debug behind a single
 * switch case, for example), so a rule narrows to its own slice of that
 * function's output by the exact explanation text it returns.
 *
 * @param confidence - The confidence to report for a match.
 * @param only - The explanation strings this rule owns, or omit to accept any.
 * @returns A `Rule['match']` implementation.
 */
function logLineMatcher(
  confidence: number,
  only?: string[],
): (ctx: MatchContext) => RuleMatch[] {
  return (ctx) => {
    const out: RuleMatch[] = []

    for (const line of ctx.lines) {
      const explanation = matchLogMiasma(line.content, ctx.lang)
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
 * Ephemeral debug output left behind after a fix.
 *
 * One entry per language (and, where one language's switch case covers more
 * than one distinct pattern that later tasks must address independently,
 * more than one entry per language).
 */
export const logRules: Rule[] = [
  {
    id: 'log/js-console',
    category: 'LOG',
    languages: ['typescript', 'javascript'],
    match: logLineMatcher(1.0),
  },
  {
    id: 'log/python-print',
    category: 'LOG',
    languages: ['python'],
    match: logLineMatcher(1.0, ['Ephemeral Python print statement']),
  },
  {
    id: 'log/python-breakpoint',
    category: 'LOG',
    languages: ['python'],
    match: logLineMatcher(1.0, ['Active Python debugger breakpoint']),
  },
  {
    id: 'log/python-logging',
    category: 'LOG',
    languages: ['python'],
    match: logLineMatcher(1.0, ['Temporary Python logging.debug call']),
  },
  {
    id: 'log/rust-macro',
    category: 'LOG',
    languages: ['rust'],
    match: logLineMatcher(1.0),
  },
  {
    id: 'log/go-print',
    category: 'LOG',
    languages: ['go'],
    match: logLineMatcher(1.0),
  },
  {
    id: 'log/php-dump',
    category: 'LOG',
    languages: ['php'],
    match: logLineMatcher(1.0),
  },
  {
    id: 'log/shell-trace',
    category: 'LOG',
    languages: ['shell'],
    match: logLineMatcher(1.0),
  },
]
