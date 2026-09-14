import type { MiasmaItem } from '../scanner/types.ts'

/**
 * Curated sample miasma items representing all 5 pollution categories
 * for interactive exploration and demonstration of the Alpheus TUI.
 */
export const DEMO_ITEMS: MiasmaItem[] = [
  {
    id: 'demo-log-1',
    filePath: 'src/auth/session.ts',
    lineNumber: 42,
    category: 'LOG',
    matchedContent: 'console.log("[DEBUG] session token:", token);',
    explanation: 'Ephemeral JavaScript/TypeScript console statement',
    confidence: 1.0,
    contextLines: [
      { line: 40, content: 'export function validateSession(session: Session) {', isTarget: false },
      { line: 41, content: '  if (!session) return false;', isTarget: false },
      { line: 42, content: '  console.log("[DEBUG] session token:", token);', isTarget: true },
      { line: 43, content: '  return session.expiresAt > Date.now();', isTarget: false },
      { line: 44, content: '}', isTarget: false },
    ],
  },
  {
    id: 'demo-suppress-1',
    filePath: 'src/api/client.ts',
    lineNumber: 18,
    category: 'SUPPRESS',
    matchedContent: '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
    explanation: 'Linter or typechecker suppression comment',
    confidence: 1.0,
    contextLines: [
      { line: 16, content: 'export async function request(endpoint: string) {', isTarget: false },
      { line: 17, content: '  // Temporary bypass for unverified schema', isTarget: false },
      { line: 18, content: '  // eslint-disable-next-line @typescript-eslint/no-explicit-any', isTarget: true },
      { line: 19, content: '  const payload: any = await fetch(endpoint);', isTarget: false },
      { line: 20, content: '  return payload;', isTarget: false },
    ],
  },
  {
    id: 'demo-scratch-1',
    filePath: 'scratch.test_output.json',
    category: 'SCRATCH',
    matchedContent: 'scratch.test_output.json',
    explanation: 'Untracked scratch or temporary file',
    confidence: 1.0,
  },
  {
    id: 'demo-tombstone-1',
    filePath: 'src/utils/crypto.ts',
    lineNumber: 88,
    category: 'TOMBSTONE',
    matchedContent: '// const oldHash = sha256(secret);',
    explanation: 'Tombstone dead code block (3 lines)',
    confidence: 1.0,
    contextLines: [
      { line: 86, content: 'export function verifySecret(secret: string, target: string) {', isTarget: false },
      { line: 87, content: '  // Replaced with argon2 below:', isTarget: false },
      { line: 88, content: '  // const oldHash = sha256(secret);', isTarget: true },
      { line: 89, content: '  // if (oldHash === target) return true;', isTarget: true },
      { line: 90, content: '  // return false;', isTarget: true },
      { line: 91, content: '  return timingSafeEqual(secret, target);', isTarget: false },
    ],
  },
  {
    id: 'demo-path-1',
    filePath: 'src/config.ts',
    lineNumber: 12,
    category: 'PATH',
    matchedContent: 'const CACHE_DIR = "/home/developer/projects/cache";',
    explanation: 'Hardcoded workstation absolute path',
    confidence: 1.0,
    contextLines: [
      { line: 10, content: 'export const config = {', isTarget: false },
      { line: 11, content: '  port: 8080,', isTarget: false },
      { line: 12, content: '  cacheDir: "/home/developer/projects/cache",', isTarget: true },
      { line: 13, content: '  timeoutMs: 5000,', isTarget: false },
      { line: 14, content: '};', isTarget: false },
    ],
  },
]
