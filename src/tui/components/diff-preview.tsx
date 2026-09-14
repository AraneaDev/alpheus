import React from 'react'
import { Box, Text } from 'ink'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { MiasmaItem } from '../../scanner/types.ts'

interface DiffPreviewProps {
  item?: MiasmaItem
  cwd: string
}

/**
 * Terminal component displaying syntax-styled contextual diffs for a selected finding.
 */
export const DiffPreview: React.FC<DiffPreviewProps> = ({ item, cwd }) => {
  if (!item) {
    return (
      <Box borderStyle="single" borderColor="gray" paddingX={1} height={10}>
        <Text dimColor>No finding selected.</Text>
      </Box>
    )
  }

  const absPath = join(cwd, item.filePath)

  if (!existsSync(absPath)) {
    return (
      <Box borderStyle="single" borderColor="gray" paddingX={1} height={10}>
        <Text dimColor>File does not exist on disk: {item.filePath}</Text>
      </Box>
    )
  }

  // Handle scratch files
  if (item.category === 'SCRATCH') {
    let preview: string
    try {
      const content = readFileSync(absPath, 'utf-8')
      const lines = content.split('\n').slice(0, 6)
      preview = lines.join('\n')
    } catch {
      preview = '(binary or unreadable file)'
    }

    return (
      <Box borderStyle="single" borderColor="magenta" flexDirection="column" paddingX={1}>
        <Text bold color="magenta">
          Scratch File: {item.filePath}
        </Text>
        <Text dimColor>{item.explanation}</Text>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Preview (first lines):</Text>
          <Text>{preview}</Text>
        </Box>
      </Box>
    )
  }

  // Handle line-level findings
  let snippet: { lineNum: number; content: string; isTarget: boolean }[] = []

  try {
    const raw = readFileSync(absPath, 'utf-8')
    const allLines = raw.split(/\r?\n/)
    const targetLine = item.lineNumber || 1
    const start = Math.max(1, targetLine - 3)
    const end = Math.min(allLines.length, targetLine + 3)

    for (let i = start; i <= end; i++) {
      snippet.push({
        lineNum: i,
        content: allLines[i - 1] || '',
        isTarget: i === targetLine,
      })
    }
  } catch {
    snippet = []
  }

  return (
    <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color="white">
          Context: {item.filePath}:{item.lineNumber}
        </Text>
        <Text color="yellow">[{item.category}] {item.explanation}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {snippet.map((l) => (
          <Box key={l.lineNum}>
            <Text dimColor>{l.lineNum.toString().padStart(4, ' ')}: </Text>
            {l.isTarget ? (
              <Text bold color="red">
                - {l.content}
              </Text>
            ) : (
              <Text dimColor>  {l.content}</Text>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  )
}
