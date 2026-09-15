import type { MatchContext, Rule, RuleMatch } from './types.ts'

/**
 * Checks whether an added line contains a hardcoded local workstation path.
 *
 * @param line - The raw content of the added line.
 * @returns An explanation string if matched, or null if clean.
 */
export function matchPathMiasma(line: string): string | null {
  // POSIX home directory pattern: /home/<user>/ or /Users/<user>/
  const posixHome = /(?:^|[\s"'`(=])(?:file:\/\/)?\/(?:home|Users)\/[a-zA-Z0-9._-]+\//
  if (posixHome.test(line)) {
    return 'Hardcoded workstation absolute home directory path'
  }

  // Windows user profile directory pattern: C:\Users\<user>\
  const windowsHome = /(?:^|[\s"'`(=])[a-zA-Z]:\\(?:\\)?Users\\(?:\\)?[a-zA-Z0-9._-]+\\/i
  if (windowsHome.test(line)) {
    return 'Hardcoded Windows workstation user directory path'
  }

  return null
}

/**
 * Builds a rule `match` function that runs `matchPathMiasma` over every line
 * of a context, keeping only the explanation named in `only`.
 *
 * `matchPathMiasma` checks the POSIX and Windows patterns behind one
 * function and returns whichever explanation fired, so a rule narrows to its
 * own pattern by that exact explanation text.
 *
 * @param confidence - The confidence to report for a match.
 * @param only - The explanation string this rule owns.
 * @returns A `Rule['match']` implementation.
 */
function pathLineMatcher(confidence: number, only: string): (ctx: MatchContext) => RuleMatch[] {
  return (ctx) => {
    const out: RuleMatch[] = []

    for (const line of ctx.lines) {
      const explanation = matchPathMiasma(line.content)
      if (explanation === only) {
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
 * Hardcoded local workstation paths that leak a developer's machine into the
 * repository.
 *
 * Applies to every language: a home directory path is pollution regardless
 * of the file it turns up in.
 */
export const pathRules: Rule[] = [
  {
    id: 'path/posix-home',
    category: 'PATH',
    languages: 'any',
    match: pathLineMatcher(0.95, 'Hardcoded workstation absolute home directory path'),
  },
  {
    id: 'path/windows-home',
    category: 'PATH',
    languages: 'any',
    match: pathLineMatcher(0.95, 'Hardcoded Windows workstation user directory path'),
  },
]
