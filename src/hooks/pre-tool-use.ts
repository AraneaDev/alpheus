import { evaluateWorkingTree } from '../engine/matcher.ts'

interface ToolPayload {
  tool_name?: string
  tool_input?: {
    command?: string
  }
}

async function handlePreTool(): Promise<void> {
  let raw = ''
  for await (const chunk of Bun.stdin.stream()) {
    raw += new TextDecoder().decode(chunk)
  }

  if (!raw.trim()) return

  try {
    const payload = JSON.parse(raw) as ToolPayload
    const cmd = payload.tool_input?.command || ''

    // Only intercept if a git commit is being attempted
    if (/\bgit\s+commit\b/.test(cmd)) {
      const items = await evaluateWorkingTree(process.cwd())
      if (items.length > 0) {
        console.error(`\n[Alpheus] Working tree contains ${items.length} uncommitted agent miasma items:`)
        for (const i of items.slice(0, 5)) {
          const loc = i.lineNumber ? `${i.filePath}:${i.lineNumber}` : i.filePath
          console.error(`  - [${i.category}] ${loc} (${i.explanation})`)
        }
        if (items.length > 5) {
          console.error(`  ... and ${items.length - 5} more items.`)
        }
        console.error('Run `/alpheus` to review and purge before committing.\n')
      }
    }
  } catch {
    // Fail quiet on hook error
  }
}

handlePreTool()
