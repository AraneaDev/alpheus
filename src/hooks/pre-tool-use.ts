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

async function main(): Promise<void> {
  let raw = ''
  for await (const chunk of Bun.stdin.stream()) {
    raw += new TextDecoder().decode(chunk)
  }

  const { exitCode, message } = await handlePreTool(raw, process.cwd())

  if (message) console.error(message)
  process.exitCode = exitCode
}

main()
