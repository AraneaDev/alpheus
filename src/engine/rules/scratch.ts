import { basename } from 'path'
import type { MatchContext, Rule, RuleMatch } from './types.ts'

/**
 * Checks whether an untracked file matches scratch or temporary artifact heuristics.
 *
 * @param relPath - Repository-relative path to the untracked file.
 * @returns Explanation string if matched, or null if legitimate.
 */
export function matchScratchFile(relPath: string): string | null {
  const name = basename(relPath)
  const isTopLevel = !relPath.includes('/')
  const isScratchDir = relPath.startsWith('scratch/') || relPath.startsWith('tmp/') || relPath.startsWith('.scratch/')

  // Explicit temporary extensions apply anywhere in the repository
  if (/\.(?:tmp|scratch|bak)$/i.test(name)) {
    return 'Untracked temporary file extension'
  }

  // Files in root or explicit scratch directories
  if (isTopLevel || isScratchDir) {
    // Generic scratch and temp prefixes
    if (/^(?:scratch|temp|tmp)[._-]/i.test(name)) {
      return 'Untracked scratch or temporary file'
    }

    // Diagnostic dumps and log files
    if (/^(?:dump|test_payload|payload|response|debug|out)\.(?:json|log|txt|sql)$/i.test(name)) {
      return 'Untracked diagnostic dump or log file'
    }

    // Single-letter or generic throwaway scripts in root
    if (/^(?:t|test|foo|bar|baz|temp)\.(?:py|js|ts|sh|rb|php)$/i.test(name)) {
      return 'Untracked throwaway script'
    }
  }

  return null
}

/**
 * Scratch or temporary files left untracked instead of being deleted.
 *
 * `matchScratchFile` judges a whole file path rather than a line, so this
 * rule reports its single match (if any) as spanning the context's one
 * nominal line. `evaluateUntracked` looks this entry up in the registry by
 * category and calls it directly, so the confidence split below is the one
 * and only place scratch findings are scored.
 */
export const scratchRules: Rule[] = [
  {
    id: 'scratch/untracked',
    category: 'SCRATCH',
    languages: 'any',
    match(ctx: MatchContext): RuleMatch[] {
      const explanation = matchScratchFile(ctx.filePath)
      if (!explanation) return []

      // An explicit .tmp/.bak/.scratch extension names itself as disposable;
      // a generic name (scratch.py, dump.json, t.py) only resembles one.
      const confidence = explanation === 'Untracked temporary file extension' ? 0.9 : 0.7

      return [{ startLine: 1, endLine: 1, explanation, confidence }]
    },
  },
]
