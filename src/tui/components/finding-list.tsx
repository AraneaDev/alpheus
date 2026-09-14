import React from 'react'
import { Box, Text } from 'ink'
import type { MiasmaItem } from '../../scanner/types.ts'
import { theme } from '../theme.ts'

interface FindingListProps {
  items: MiasmaItem[]
  cursorIndex: number
  selectedIds: Set<string>
}

export const FindingList: React.FC<FindingListProps> = ({
  items,
  cursorIndex,
  selectedIds,
}) => {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} flexGrow={1}>
      <Text bold color="cyan">
        Miasma Items ({items.length})
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {items.map((item, idx) => {
          const isCursor = idx === cursorIndex
          const isSelected = selectedIds.has(item.id)
          const loc = item.lineNumber ? `${item.filePath}:${item.lineNumber}` : item.filePath
          const catColor = theme.categoryColor(item.category)

          return (
            <Box key={item.id}>
              <Text bold color={isCursor ? 'cyan' : undefined}>
                {isCursor ? `${theme.pointer} ` : '  '}
              </Text>
              <Text color={isSelected ? 'green' : 'gray'}>
                {theme.checkbox(isSelected)}{' '}
              </Text>
              <Text bold color={catColor}>
                [{item.category}]
              </Text>
              <Text bold color={isCursor ? 'white' : 'gray'}>
                {' '}{loc}
              </Text>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
