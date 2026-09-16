import type { MiasmaCategory } from '../scanner/types.ts'

/**
 * Terminal UI color theme, glyphs, and border styles.
 */
export const theme = {
  categoryColor: (category: MiasmaCategory): string => {
    switch (category) {
      case 'LOG':
        return 'cyan'
      case 'SUPPRESS':
        return 'yellow'
      case 'SCRATCH':
        return 'magenta'
      case 'TOMBSTONE':
        return 'gray'
      case 'PATH':
        return 'red'
      default:
        return 'white'
    }
  },
  pointer: '>',
  checkbox: (selected: boolean): string => (selected ? '[x]' : '[ ]'),
  borderStyle: 'round' as const,
  /** Colour for a finding scored below the confidence threshold, so it reads as unticked-on-purpose. */
  belowThresholdColor: 'gray',
}
