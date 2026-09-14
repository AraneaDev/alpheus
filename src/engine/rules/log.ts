import type { SupportedLanguage } from '../language.ts'

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
