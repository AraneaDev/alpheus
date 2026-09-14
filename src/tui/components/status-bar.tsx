import React from 'react'
import { Box, Text } from 'ink'

interface StatusBarProps {
  selectedCount: number
  totalCount: number
}

/**
 * Footer status bar displaying keybindings and selection counts.
 */
export const StatusBar: React.FC<StatusBarProps> = ({ selectedCount, totalCount }) => {
  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      justifyContent="space-between"
      paddingX={1}
      marginTop={1}
    >
      <Box>
        <Text color="cyan">&lt;↑/↓/j/k&gt; Navigate  </Text>
        <Text color="yellow">&lt;Space&gt; Toggle  </Text>
        <Text color="magenta">&lt;a&gt; Toggle All  </Text>
        <Text color="red">&lt;q&gt; Cancel</Text>
      </Box>
      <Box>
        <Text bold color="green">
          &lt;Enter&gt; Purge Selected ({selectedCount}/{totalCount})
        </Text>
      </Box>
    </Box>
  )
}
