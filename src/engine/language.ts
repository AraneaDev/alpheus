/**
 * Supported programming languages for pattern matching.
 */
export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'php'
  | 'shell'
  | 'unknown'

/**
 * Maps a file path or name to its programming language based on extension.
 *
 * @param filePath - Relative or absolute path to the file.
 * @returns The detected language or 'unknown'.
 */
export function detectLanguage(filePath: string): SupportedLanguage {
  const ext = filePath.split('.').pop()?.toLowerCase()

  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
      return 'typescript'
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript'
    case 'py':
    case 'pyi':
      return 'python'
    case 'rs':
      return 'rust'
    case 'go':
      return 'go'
    case 'php':
      return 'php'
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'shell'
    default:
      return 'unknown'
  }
}
