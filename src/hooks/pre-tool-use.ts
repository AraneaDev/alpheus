import { DEFAULT_MIN_CONFIDENCE, partitionByConfidence } from '../engine/threshold.ts'
import { evaluateWorkingTree } from '../engine/matcher.ts'

interface ToolPayload {
  tool_name?: string
  tool_input?: {
    command?: string
  }
  cwd?: string
}

/**
 * Decides whether a tool call should be blocked, and what to say about it.
 *
 * Claude Code surfaces a hook's stderr to the model on exit 2 and ignores it on
 * exit 0, so a warning that does not exit 2 is a warning nobody reads.
 *
 * @param raw - The raw JSON payload on stdin.
 * @param fallbackCwd - Directory to scan when the payload carries none.
 * @returns The exit code to use and the message to write to stderr.
 */
export async function handlePreTool(
  raw: string,
  fallbackCwd: string,
): Promise<{ exitCode: number; message: string }> {
  const mode = process.env.ALPHEUS_HOOK_MODE ?? 'block'
  if (mode === 'off' || !raw.trim()) return { exitCode: 0, message: '' }

  try {
    const payload = JSON.parse(raw) as ToolPayload
    const command = payload.tool_input?.command ?? ''
    if (!/\bgit\s+commit\b/.test(command)) return { exitCode: 0, message: '' }

    const cwd = payload.cwd ?? fallbackCwd
    const items = await evaluateWorkingTree(cwd)
    const { actionable } = partitionByConfidence(items, DEFAULT_MIN_CONFIDENCE)

    if (actionable.length === 0) return { exitCode: 0, message: '' }

    const lines = [`[Alpheus] ${actionable.length} agent miasma items in the working tree:`]
    for (const item of actionable.slice(0, 5)) {
      const loc = item.span ? `${item.filePath}:${item.span.startLine}` : item.filePath
      lines.push(`  - [${item.category}] ${loc} (${item.explanation})`)
    }
    if (actionable.length > 5) lines.push(`  ... and ${actionable.length - 5} more.`)
    lines.push('Run `/alpheus` to review and purge before committing, or set ALPHEUS_HOOK_MODE=warn.')

    return { exitCode: mode === 'warn' ? 0 : 2, message: lines.join('\n') }
  } catch {
    // A hook that throws must not wedge the tool call it was inspecting.
    return { exitCode: 0, message: '' }
  }
}

/**
 * Accumulates an async byte stream into a single decoded string.
 *
 * Extracted so the entry point's stdin handling can be exercised with a fake
 * async iterable in tests, rather than only ever covered by piping real stdin.
 *
 * @param stream - The chunks to decode and concatenate, in order.
 * @returns The concatenated, decoded text.
 */
export async function readAll(stream: AsyncIterable<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder()
  let raw = ''
  for await (const chunk of stream) {
    raw += decoder.decode(chunk, { stream: true })
  }
  raw += decoder.decode()
  return raw
}

/**
 * Reads the payload from a stdin stream and runs it through `handlePreTool`.
 *
 * Takes the stdin stream and fallback cwd as parameters, rather than reading
 * `Bun.stdin`/`process.cwd()` itself, so the entry point's wiring is covered by
 * a test with a fake stream instead of only ever running for real. It applies
 * no process side effects itself; the `import.meta.main` guard below does.
 *
 * @param stdin - The stdin stream to read the payload from.
 * @param cwd - Fallback working directory when the payload carries none.
 * @returns The exit code to use and the message to write to stderr.
 */
export async function main(
  stdin: AsyncIterable<Uint8Array>,
  cwd: string,
): Promise<{ exitCode: number; message: string }> {
  const raw = await readAll(stdin)
  return handlePreTool(raw, cwd)
}

if (import.meta.main) {
  const { exitCode, message } = await main(Bun.stdin.stream(), process.cwd())
  if (message) console.error(message)
  process.exitCode = exitCode
}
