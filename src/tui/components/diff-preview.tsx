import React from 'react'
import { Box, Text } from 'ink'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { MiasmaItem } from '../../scanner/types.ts'

interface DiffPreviewProps {
  item?: MiasmaItem
  cwd: string
  maxLines?: number
}

/**
 * Terminal component displaying syntax-styled contextual diffs for a selected finding.
 */
export const DiffPreview: React.FC<DiffPreviewProps> = ({ item, cwd, maxLines }) => {
  if (!item) {
    return (
      <Box borderStyle="single" borderColor="gray" paddingX={1} flexGrow={1} height="100%">
        <Text dimColor>No finding selected.</Text>
      </Box>
    )
  }

  const absPath = join(cwd, item.filePath)

  // Handle scratch files
  if (item.category === 'SCRATCH') {
    const lineLimit = maxLines ?? 6
    let preview: string
    if (existsSync(absPath)) {
      try {
        const content = readFileSync(absPath, 'utf-8')
        const lines = content.split('\n').slice(0, lineLimit)
        preview = lines.join('\n')
      } catch {
        preview = '(binary or unreadable file)'
      }
    } else {
      preview = '(untracked scratch file preview)'
    }

    return (
      <Box borderStyle="single" borderColor="magenta" flexDirection="column" paddingX={1} flexGrow={1} height="100%">
        <Text bold color="magenta">
          Scratch File: {item.filePath}
        </Text>
        <Text dimColor>{item.explanation}</Text>
        <Box marginTop={1} flexDirection="column" flexGrow={1}>
          <Text dimColor>Preview (first lines):</Text>
          <Text>{preview}</Text>
        </Box>
      </Box>
    )
  }

  // Handle line-level findings
  const lineLimit = maxLines ?? 7
  const radius = Math.max(2, Math.floor((lineLimit - 1) / 2))
  let snippet: { lineNum: number; content: string; isTarget: boolean }[] = []

  if (item.contextLines && item.contextLines.length > 0) {
    const rawSnippet = item.contextLines.map((c) => ({
      lineNum: c.line,
      content: c.content,
      isTarget: c.isTarget,
    }))
    if (rawSnippet.length > lineLimit) {
      const targetIdx = rawSnippet.findIndex((c) => c.isTarget)
      const center = targetIdx >= 0 ? targetIdx : 0
      const start = Math.max(0, Math.min(center - radius, rawSnippet.length - lineLimit))
      snippet = rawSnippet.slice(start, start + lineLimit)
    } else {
      snippet = rawSnippet
    }
  } else if (existsSync(absPath)) {
    try {
      const raw = readFileSync(absPath, 'utf-8')
      const allLines = raw.split(/\r?\n/)
      const targetLine = item.lineNumber || 1
      const start = Math.max(1, targetLine - radius)
      const end = Math.min(allLines.length, targetLine + radius)

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
  } else {
    return (
      <Box borderStyle="single" borderColor="gray" paddingX={1} flexGrow={1} height="100%">
        <Text dimColor>File does not exist on disk: {item.filePath}</Text>
      </Box>
    )
  }

  return (
    <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} flexGrow={1} height="100%">
      <Box justifyContent="space-between">
        <Text bold color="white" wrap="truncate-end">
          Context: {item.filePath}:{item.lineNumber}
        </Text>
        <Text color="yellow">[{item.category}] {item.explanation}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column" flexGrow={1}>
        {snippet.map((l) => (
          <Box key={l.lineNum}>
            <Text dimColor>{l.lineNum.toString().padStart(4, ' ')}: </Text>
            {l.isTarget ? (
              <Text bold color="red" wrap="truncate-end">
                - {l.content}
              </Text>
            ) : (
              <Text dimColor wrap="truncate-end">  {l.content}</Text>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  )
}
