import type { MiasmaItem } from '../scanner/types.ts'

/**
 * Curated sample miasma items representing all 5 pollution categories
 * for interactive exploration and demonstration of the Alpheus TUI.
 */
export const DEMO_ITEMS: MiasmaItem[] = [
  {
    id: 'demo-log-1',
    filePath: 'src/auth/session.ts',
    category: 'LOG',
    ruleId: 'log/typescript',
    span: { startLine: 42, endLine: 42, lines: ['  console.log("[DEBUG] session token:", token);'] },
    explanation: 'Ephemeral JavaScript/TypeScript console statement',
    confidence: 1.0,
  },
  {
    id: 'demo-suppress-1',
    filePath: 'src/api/client.ts',
    category: 'SUPPRESS',
    ruleId: 'suppress/typescript',
    span: { startLine: 18, endLine: 18, lines: ['  // eslint-disable-next-line @typescript-eslint/no-explicit-any'] },
    explanation: 'Linter or typechecker suppression comment',
    confidence: 1.0,
  },
  {
    id: 'demo-scratch-1',
    filePath: 'scratch.test_output.json',
    category: 'SCRATCH',
    ruleId: 'scratch/untracked',
    explanation: 'Untracked scratch or temporary file',
    confidence: 1.0,
  },
  {
    id: 'demo-tombstone-1',
    filePath: 'src/utils/crypto.ts',
    category: 'TOMBSTONE',
    ruleId: 'tombstone/typescript',
    span: { startLine: 88, endLine: 88, lines: ['  // const oldHash = sha256(secret);'] },
    explanation: 'Tombstone dead code block (3 lines)',
    confidence: 1.0,
  },
  {
    id: 'demo-path-1',
    filePath: 'src/config.ts',
    category: 'PATH',
    ruleId: 'path/typescript',
    span: { startLine: 12, endLine: 12, lines: ['  const CACHE_DIR = "/home/developer/projects/cache";'] },
    explanation: 'Hardcoded workstation absolute path',
    confidence: 1.0,
  },
]
