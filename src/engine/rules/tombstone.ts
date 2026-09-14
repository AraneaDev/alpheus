import type { SupportedLanguage } from '../language.ts'

export interface TombstoneBlock {
  startLine: number
  endLine: number
  explanation: string
}

/**
 * Checks whether a series of lines contains a commented-out dead code block.
 *
 * @param lines - Array of lines with their line numbers and content.
 * @param lang - Programming language.
 * @returns Array of detected tombstone blocks.
 */
export function matchTombstoneBlocks(
  lines: { lineNumber: number; content: string }[],
  _lang: SupportedLanguage,
): TombstoneBlock[] {
  const blocks: TombstoneBlock[] = []
  let currentBlock: { lineNumber: number; content: string }[] = []

  function isCommented(text: string): boolean {
    const trimmed = text.trim()
    return trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('--')
  }

  function stripCommentPrefix(text: string): string {
    return text.trim().replace(/^(?:\/\/|#|--)\s*/, '')
  }

  function containsCodeSyntax(text: string): boolean {
    // Structural syntax markers typical of source code
    const syntaxPatterns = [
      /[{};]/,
      /=>/,
      /\b(?:const|let|var|def|return|import|class|function|func|fn|if|else|switch|for|while)\b/,
      /\b[a-zA-Z0-9_]+\s*\([^)]*\)/, // Function call
      /\b[a-zA-Z0-9_]+\s*=\s*/, // Variable assignment
    ]
    return syntaxPatterns.some((pattern) => pattern.test(text))
  }

  function flushBlock(): void {
    if (currentBlock.length >= 3) {
      // Check if at least half the lines in the block resemble code rather than plain text
      const codeLikeCount = currentBlock.filter((line) => {
        const stripped = stripCommentPrefix(line.content)
        return containsCodeSyntax(stripped)
      }).length

      if (codeLikeCount >= 2) {
        blocks.push({
          startLine: currentBlock[0].lineNumber,
          endLine: currentBlock[currentBlock.length - 1].lineNumber,
          explanation: `Commented-out dead code block (${currentBlock.length} lines)`,
        })
      }
    }
    currentBlock = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isCommented(line.content)) {
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
    } else {
      flushBlock()
    }
  }

  flushBlock()
  return blocks
}
