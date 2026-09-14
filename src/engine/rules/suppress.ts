import type { SupportedLanguage } from '../language.ts'

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
