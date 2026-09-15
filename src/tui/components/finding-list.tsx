import React from 'react'
import { Box, Text } from 'ink'
import type { MiasmaItem } from '../../scanner/types.ts'
import { theme } from '../theme.ts'

interface FindingListProps {
  items: MiasmaItem[]
  cursorIndex: number
  selectedIds: Set<string>
  maxVisibleItems?: number
}

/**
 * Interactive list displaying detected miasma items with cursor and selection status.
 */
export const FindingList: React.FC<FindingListProps> = ({
  items,
  cursorIndex,
  selectedIds,
  maxVisibleItems,
}) => {
  const visibleCount = maxVisibleItems ?? items.length
  let startIndex = 0
  let endIndex = items.length

  if (visibleCount < items.length) {
    const half = Math.floor(visibleCount / 2)
    startIndex = Math.max(0, Math.min(cursorIndex - half, items.length - visibleCount))
    endIndex = startIndex + visibleCount
  }

  const visibleItems = items.slice(startIndex, endIndex)
  const hasMoreAbove = startIndex > 0
  const hasMoreBelow = endIndex < items.length

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} flexGrow={1} height="100%">
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          Miasma Items ({items.length})
        </Text>
        {hasMoreAbove && (
          <Text dimColor>^ {startIndex} above</Text>
        )}
      </Box>
      <Box flexDirection="column" marginTop={1} flexGrow={1}>
        {visibleItems.map((item, relIdx) => {
          const actualIdx = startIndex + relIdx
          const isCursor = actualIdx === cursorIndex
          const isSelected = selectedIds.has(item.id)
          const loc = item.span?.startLine ? `${item.filePath}:${item.span.startLine}` : item.filePath
          const catColor = theme.categoryColor(item.category)
          const catLabel = `[${item.category}]`.padEnd(11, ' ')

          return (
            <Box key={item.id}>
              <Text bold color={isCursor ? 'cyan' : undefined}>
                {isCursor ? `${theme.pointer} ` : '  '}
              </Text>
              <Text color={isSelected ? 'green' : 'gray'}>
                {theme.checkbox(isSelected)}{' '}
              </Text>
              <Text bold color={catColor}>
                {catLabel}{' '}
              </Text>
              <Text bold={isCursor} color={isCursor ? 'white' : 'gray'} wrap="truncate-end">
                {loc}
              </Text>
            </Box>
          )
        })}
      </Box>
      {hasMoreBelow && (
        <Box marginTop={1}>
          <Text dimColor>v {items.length - endIndex} below</Text>
        </Box>
      )}
    </Box>
  )
}
