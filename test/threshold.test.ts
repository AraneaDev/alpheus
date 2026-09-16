import { describe, expect, it } from 'bun:test'
import { DEFAULT_MIN_CONFIDENCE, parseMinConfidence, partitionByConfidence } from '../src/engine/threshold.ts'
import type { MiasmaItem } from '../src/scanner/types.ts'

function at(confidence: number): MiasmaItem {
  return {
    id: `i-${confidence}`,
    filePath: 'a.ts',
    category: 'LOG',
    ruleId: 'log/js-console',
    span: { startLine: 1, endLine: 1, lines: ['console.log(x)'] },
    explanation: 'Debug log',
    confidence,
  }
}

describe('partitionByConfidence', () => {
  it('treats the threshold as inclusive', () => {
    const { actionable, review } = partitionByConfidence([at(0.8)], 0.8)
    expect(actionable).toHaveLength(1)
    expect(review).toHaveLength(0)
  })

  it('sends anything below the threshold to review', () => {
    const { actionable, review } = partitionByConfidence([at(0.79), at(0.4)], 0.8)
    expect(actionable).toHaveLength(0)
    expect(review).toHaveLength(2)
  })
})

describe('parseMinConfidence', () => {
  it('defaults to 0.8', () => {
    expect(parseMinConfidence([])).toBe(DEFAULT_MIN_CONFIDENCE)
  })

  it('reads --min-confidence 0.5', () => {
    expect(parseMinConfidence(['clean', '--min-confidence', '0.5'])).toBe(0.5)
  })

  it('reads --min-confidence=0.5', () => {
    expect(parseMinConfidence(['clean', '--min-confidence=0.5'])).toBe(0.5)
  })

  it('accepts 0, which means act on everything', () => {
    expect(parseMinConfidence(['check', '--min-confidence', '0'])).toBe(0)
  })

  it('falls back to the default on nonsense', () => {
    expect(parseMinConfidence(['clean', '--min-confidence', 'banana'])).toBe(DEFAULT_MIN_CONFIDENCE)
    expect(parseMinConfidence(['clean', '--min-confidence', '5'])).toBe(DEFAULT_MIN_CONFIDENCE)
    expect(parseMinConfidence(['clean', '--min-confidence', '-1'])).toBe(DEFAULT_MIN_CONFIDENCE)
  })

  it('does not read a bare flag as zero', () => {
    // Number('') is 0, which would silently mean "act on everything".
    expect(parseMinConfidence(['clean', '--min-confidence'])).toBe(DEFAULT_MIN_CONFIDENCE)
    expect(parseMinConfidence(['clean', '--min-confidence', '--json'])).toBe(DEFAULT_MIN_CONFIDENCE)
  })
})
