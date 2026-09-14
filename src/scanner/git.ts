import type { DiffHunk, HunkLine } from './types.ts'

/**
 * Parses raw unified diff output (-U0 format) into structured DiffHunk objects.
 * Handles standard (a/b), mnemonic (i/w/c), and prefix-less diff outputs.
 *
 * @param diffOutput - Raw output string from git diff -U0.
 * @returns Array of structured diff hunks.
 */
export function parseUnifiedDiff(diffOutput: string): DiffHunk[] {
  const hunks: DiffHunk[] = []
  const lines = diffOutput.split('\n')

  let currentFile: string | null = null
  let currentStartLine = 0
  let currentLineCount = 0
  let currentHunkLines: HunkLine[] = []
  let addedLineOffset = 0

  function flushCurrentHunk(): void {
    if (currentFile && currentHunkLines.length > 0) {
      hunks.push({
        filePath: currentFile,
        startLine: currentStartLine,
        lineCount: currentLineCount || currentHunkLines.length,
        lines: currentHunkLines,
      })
    }
    currentHunkLines = []
  }

  for (const line of lines) {
    // Detect new file header: +++ b/path/to/file, +++ w/path/to/file, etc.
    if (line.startsWith('+++ ')) {
      const target = line.slice(4).trim()
      if (target !== '/dev/null') {
        flushCurrentHunk()
        // Strip single-letter prefix if present (e.g. b/, w/, a/, i/)
        currentFile = target.replace(/^[a-zA-Z]\//, '')
        continue
      }
    } else if (line.startsWith('diff --git ')) {
      const parts = line.split(' ')
      if (parts.length >= 4) {
        const destPart = parts[parts.length - 1]
        flushCurrentHunk()
        currentFile = destPart.replace(/^[a-zA-Z]\//, '').trim()
      }
    }

    // Detect hunk header: @@ -a,b +c,d @@ or @@ -a +c @@
    const hunkMatch = line.match(/^@@\s+-[0-9]+(?:,[0-9]+)?\s+\+([0-9]+)(?:,([0-9]+))?\s+@@/)
    if (hunkMatch) {
      flushCurrentHunk()
      currentStartLine = parseInt(hunkMatch[1], 10)
      currentLineCount = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1
      addedLineOffset = 0
      continue
    }

    // Process line additions
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const content = line.slice(1)
      const lineNumber = currentStartLine + addedLineOffset
      currentHunkLines.push({
        lineNumber,
        content,
        type: 'add',
      })
      addedLineOffset++
    }
  }

  flushCurrentHunk()
  return hunks
}

/**
 * Runs a git command in the target directory and returns its stdout.
 *
 * @param args - Subcommand and arguments to pass to git.
 * @param cwd - Working directory.
 * @returns Raw stdout string.
 */
async function execGit(args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const stdout = await new Response(proc.stdout).text()
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    return ''
  }

  return stdout
}

/**
 * Scans both staged and unstaged git diff additions.
 * Explicitly forces a/ and b/ prefixes to remain resilient against git config.
 *
 * @param cwd - Working directory.
 * @returns Combined diff hunks.
 */
export async function scanGitDiff(cwd: string): Promise<DiffHunk[]> {
  const [stagedOutput, unstagedOutput] = await Promise.all([
    execGit(['diff', '-U0', '--staged', '--src-prefix=a/', '--dst-prefix=b/'], cwd),
    execGit(['diff', '-U0', '--src-prefix=a/', '--dst-prefix=b/'], cwd),
  ])

  const stagedHunks = parseUnifiedDiff(stagedOutput)
  const unstagedHunks = parseUnifiedDiff(unstagedOutput)

  // Merge hunks, avoiding duplicate lines if a file is partially staged
  const seen = new Set<string>()
  const merged: DiffHunk[] = []

  for (const hunk of [...stagedHunks, ...unstagedHunks]) {
    const uniqueLines = hunk.lines.filter((line) => {
      const key = `${hunk.filePath}:${line.lineNumber}:${line.content}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    if (uniqueLines.length > 0) {
      merged.push({
        ...hunk,
        lines: uniqueLines,
      })
    }
  }

  return merged
}

/**
 * Lists all untracked files in the working tree that are not ignored by .gitignore.
 *
 * @param cwd - Working directory.
 * @returns Relative paths of untracked files.
 */
export async function scanUntrackedFiles(cwd: string): Promise<string[]> {
  const output = await execGit(['ls-files', '--others', '--exclude-standard'], cwd)
  return output
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f.length > 0)
}
