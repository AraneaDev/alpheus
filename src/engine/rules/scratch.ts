import { basename } from 'path'

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
