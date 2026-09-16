import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { main } from '../src/cli.ts'

/**
 * Stages every change in the given repository, so a brand-new file shows up
 * in the staged half of `scanGitDiff` rather than being invisible to it.
 *
 * @param cwd - Repository working directory.
 */
async function gitAddAll(cwd: string): Promise<void> {
  await Bun.spawn(['git', 'add', '-A'], { cwd }).exited
}

describe('CLI Commands Dispatching', () => {
  const tmpDir = join('/tmp', `alpheus-cli-test-${Date.now()}`)

  beforeEach(async () => {
    mkdirSync(tmpDir, { recursive: true })
    const initProc = Bun.spawn(['git', 'init'], { cwd: tmpDir })
    await initProc.exited
    const configName = Bun.spawn(['git', 'config', 'user.name', 'Tester'], { cwd: tmpDir })
    await configName.exited
    const configEmail = Bun.spawn(['git', 'config', 'user.email', 'tester@example.com'], { cwd: tmpDir })
    await configEmail.exited

    writeFileSync(join(tmpDir, 'file.ts'), 'export const x = 1\n')
    const addProc = Bun.spawn(['git', 'add', '.'], { cwd: tmpDir })
    await addProc.exited
    const commitProc = Bun.spawn(['git', 'commit', '-m', 'init'], { cwd: tmpDir })
    await commitProc.exited
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should handle help command and return 0', async () => {
    const code = await main(['help'], tmpDir)
    expect(code).toBe(0)
  })

  it('should handle default no-arg invocation in non-TTY mode and return 0 for clean repo', async () => {
    const code = await main([], tmpDir)
    expect(code).toBe(0)
  })

  it('should handle demo command in non-TTY mode and return 0', async () => {
    const originalIsTTY = process.stdin.isTTY
    try {
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
      const code = await main(['demo'], tmpDir)
      expect(code).toBe(0)
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true })
    }
  })

  it('should handle default no-arg invocation in non-TTY mode and return 1 when miasma is present', async () => {
    writeFileSync(join(tmpDir, 'file.ts'), 'export const x = 1\nconsole.log("miasma");\n')
    const originalIsTTY = process.stdin.isTTY
    try {
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
      const code = await main([], tmpDir)
      expect(code).toBe(1)
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true })
    }
  })

  it('should return 0 for check in a clean repository', async () => {
    const code = await main(['check'], tmpDir)
    expect(code).toBe(0)
  })

  it('should return 0 for check with --json and --quiet flags', async () => {
    const codeJson = await main(['check', '--json'], tmpDir)
    expect(codeJson).toBe(0)

    const codeQuiet = await main(['check', '--quiet'], tmpDir)
    expect(codeQuiet).toBe(0)
  })

  it('should return 0 for clean in a clean repository', async () => {
    const code = await main(['clean'], tmpDir)
    expect(code).toBe(0)
  })

  it('should return 0 for backups when no backups exist', async () => {
    const code = await main(['backups'], tmpDir)
    expect(code).toBe(0)
  })

  it('should return 2 for backups when reading backups encounters filesystem error', async () => {
    const badDir = join(tmpDir, 'baddir')
    mkdirSync(join(badDir, '.alpheus'), { recursive: true })
    // Create backups as a file instead of a directory to trigger ENOTDIR
    writeFileSync(join(badDir, '.alpheus', 'backups'), 'not a directory')

    const code = await main(['backups'], badDir)
    expect(code).toBe(2)
  })

  it('should return 2 for restore with nonexistent snapshot', async () => {
    const code = await main(['restore', 'missing_id_1234'], tmpDir)
    expect(code).toBe(2)
  })

  it('should detect miasma and support dry-run, clean, backups, and restore lifecycle', async () => {
    // Add debug log to file.ts
    writeFileSync(join(tmpDir, 'file.ts'), 'export const x = 1\nconsole.log("agent test");\n')
    writeFileSync(join(tmpDir, 'temp.scratch.json'), '{"scratch": true}\n')

    // 1. check detects miasma -> exit 1
    const checkCode = await main(['check'], tmpDir)
    expect(checkCode).toBe(1)

    // 2. clean --dry-run
    const dryRunCode = await main(['clean', '--dry-run'], tmpDir)
    expect(dryRunCode).toBe(0)

    // 3. clean
    const cleanCode = await main(['clean'], tmpDir)
    expect(cleanCode).toBe(0)

    // 4. verify clean state after purge
    const checkAfterClean = await main(['check'], tmpDir)
    expect(checkAfterClean).toBe(0)

    // 5. list backups
    const backupsCode = await main(['backups'], tmpDir)
    expect(backupsCode).toBe(0)

    // 6. restore
    const restoreCode = await main(['restore'], tmpDir)
    expect(restoreCode).toBe(0)

    // 7. verify items returned after restore
    const checkAfterRestore = await main(['check'], tmpDir)
    expect(checkAfterRestore).toBe(1)
  })

  it('reports findings it could not verify rather than staying silent', async () => {
    // Two identical log lines: the text is ambiguous, so neither can be anchored.
    writeFileSync(join(tmpDir, 'app.ts'), 'console.log(a)\nconst b = 2\nconsole.log(a)\n')
    await gitAddAll(tmpDir)

    const lines: string[] = []
    const spy = spyOn(console, 'log').mockImplementation((msg: string) => {
      lines.push(String(msg))
    })

    await main(['clean'], tmpDir)

    spy.mockRestore()
    const output = lines.join('\n')

    expect(output).toContain('could not verify')
    expect(output).toContain('app.ts')
    expect(output).toContain('appears more than once')
    // Nothing was touched.
    expect(readFileSync(join(tmpDir, 'app.ts'), 'utf-8')).toBe(
      'console.log(a)\nconst b = 2\nconsole.log(a)\n',
    )
  })

  it('does not claim a backup was saved when every finding was unverifiable', async () => {
    // Same ambiguous-lines setup as above: nothing is anchored, so purgeMiasma
    // creates no backup at all. A test that only checked the unverifiable
    // block would still pass against the old code, which printed
    // "Backup saved to none." here regardless.
    writeFileSync(join(tmpDir, 'app.ts'), 'console.log(a)\nconst b = 2\nconsole.log(a)\n')
    await gitAddAll(tmpDir)

    const lines: string[] = []
    const spy = spyOn(console, 'log').mockImplementation((msg: string) => {
      lines.push(String(msg))
    })

    const code = await main(['clean'], tmpDir)

    spy.mockRestore()
    const output = lines.join('\n')

    expect(code).toBe(0)
    expect(output).not.toContain('Backup saved')
    expect(output).not.toContain('restore')
    expect(output).toContain('Nothing was purged; no changes were made.')
  })

  it('does not report backupId "dry-run" for a real clean where nothing anchors', async () => {
    // Same ambiguous, unanchorable fixture, but read the --json payload
    // directly and assert the field value rather than just that it parses:
    // a consumer of `alpheus clean --json` (CI, an agent) reads backupId to
    // decide whether a real operation happened at all.
    writeFileSync(join(tmpDir, 'app.ts'), 'console.log(a)\nconst b = 2\nconsole.log(a)\n')
    await gitAddAll(tmpDir)

    const lines: string[] = []
    const spy = spyOn(console, 'log').mockImplementation((msg: string) => {
      lines.push(String(msg))
    })

    const code = await main(['clean', '--json'], tmpDir)

    spy.mockRestore()
    const parsed = JSON.parse(lines.join('\n')) as { backupId: string; backupPath: string }

    expect(code).toBe(0)
    expect(parsed.backupId).not.toBe('dry-run')
    expect(parsed.backupId).toBe('')
    expect(parsed.backupPath).toBe('')
  })

  it('reports backupId "dry-run" for a genuine --dry-run clean, consistent with backupPath', async () => {
    writeFileSync(join(tmpDir, 'file.ts'), 'export const x = 1\nconsole.log("agent test");\n')

    const lines: string[] = []
    const spy = spyOn(console, 'log').mockImplementation((msg: string) => {
      lines.push(String(msg))
    })

    const code = await main(['clean', '--dry-run', '--json'], tmpDir)

    spy.mockRestore()
    const parsed = JSON.parse(lines.join('\n')) as { backupId: string; backupPath: string }

    expect(code).toBe(0)
    // A dry run creates no backup, so the path must agree with the "dry-run" label.
    expect(parsed.backupId).toBe('dry-run')
    expect(parsed.backupPath).toBe('')
    // The file itself must be untouched, confirming this really was a dry run.
    expect(readFileSync(join(tmpDir, 'file.ts'), 'utf-8')).toBe(
      'export const x = 1\nconsole.log("agent test");\n',
    )
  })

  it('reports a finding whose recorded text is no longer in the file as "not-found"', async () => {
    // Stage one version of an added console.log line, then edit it again
    // without staging: the staged half of the diff still carries the old
    // text, which the file on disk no longer has anywhere.
    writeFileSync(join(tmpDir, 'stale.ts'), 'export const y = 1\nconsole.log("first")\n')
    await gitAddAll(tmpDir)
    writeFileSync(join(tmpDir, 'stale.ts'), 'export const y = 1\nconsole.log("second")\n')

    const lines: string[] = []
    const spy = spyOn(console, 'log').mockImplementation((msg: string) => {
      lines.push(String(msg))
    })

    await main(['clean'], tmpDir)

    spy.mockRestore()
    const output = lines.join('\n')

    expect(output).toContain('could not verify')
    expect(output).toContain('stale.ts')
    expect(output).toContain('the text has moved or been removed')
  })

  it('reports a finding whose file has disappeared as "missing-file"', async () => {
    // Stage a whole new file (so the staged diff records its console.log
    // line), then delete it from disk without staging the deletion: the
    // finding still exists, but its file does not.
    writeFileSync(join(tmpDir, 'ghost.ts'), 'export const z = 1\nconsole.log("ghost")\n')
    await gitAddAll(tmpDir)
    unlinkSync(join(tmpDir, 'ghost.ts'))

    const lines: string[] = []
    const spy = spyOn(console, 'log').mockImplementation((msg: string) => {
      lines.push(String(msg))
    })

    await main(['clean'], tmpDir)

    spy.mockRestore()
    const output = lines.join('\n')

    expect(output).toContain('could not verify')
    expect(output).toContain('ghost.ts')
    expect(output).toContain('the file is gone')
  })

  it('leaves a CI-runner home path in a workflow file for review instead of purging it', async () => {
    // scorePosixHome scores /home/runner/... at 0.3 inside .github/workflows,
    // below the 0.8 default: it is how the build works, not a leaked machine.
    mkdirSync(join(tmpDir, '.github', 'workflows'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.github', 'workflows', 'ci.yml'),
      'jobs:\n  build:\n    steps:\n      - run: echo /home/runner/work/repo/repo\n',
    )
    await gitAddAll(tmpDir)

    const checkCode = await main(['check'], tmpDir)
    expect(checkCode).toBe(0)

    const lines: string[] = []
    const spy = spyOn(console, 'log').mockImplementation((msg: string) => {
      lines.push(String(msg))
    })
    const cleanCode = await main(['clean'], tmpDir)
    spy.mockRestore()

    expect(cleanCode).toBe(0)
    const output = lines.join('\n')
    expect(output).toContain('need review')
    expect(output).toContain('ci.yml')
    expect(readFileSync(join(tmpDir, '.github', 'workflows', 'ci.yml'), 'utf-8')).toContain('/home/runner/')
  })

  it('leaves a @ts-expect-error comment for review instead of purging it', async () => {
    // The suppress/ts rule scores this directive at 0.4: unlike @ts-ignore it
    // errors when unneeded, so it is usually load-bearing rather than lazy.
    writeFileSync(
      join(tmpDir, 'legacy.ts'),
      'export function widen(x: number): unknown {\n  // @ts-expect-error waiting on upstream types\n  return x\n}\n',
    )
    await gitAddAll(tmpDir)

    const checkCode = await main(['check'], tmpDir)
    expect(checkCode).toBe(0)

    const lines: string[] = []
    const spy = spyOn(console, 'log').mockImplementation((msg: string) => {
      lines.push(String(msg))
    })
    const cleanCode = await main(['clean'], tmpDir)
    spy.mockRestore()

    expect(cleanCode).toBe(0)
    const output = lines.join('\n')
    expect(output).toContain('need review')
    expect(output).toContain('legacy.ts')
    expect(readFileSync(join(tmpDir, 'legacy.ts'), 'utf-8')).toContain('@ts-expect-error')
  })

  it('purges a below-threshold finding when --min-confidence lowers the bar', async () => {
    writeFileSync(
      join(tmpDir, 'legacy.ts'),
      'export function widen(x: number): unknown {\n  // @ts-expect-error waiting on upstream types\n  return x\n}\n',
    )
    await gitAddAll(tmpDir)

    const cleanCode = await main(['clean', '--min-confidence', '0.4'], tmpDir)
    expect(cleanCode).toBe(0)
    expect(readFileSync(join(tmpDir, 'legacy.ts'), 'utf-8')).not.toContain('@ts-expect-error')
  })

  it('rejects an unknown command instead of launching the TUI', async () => {
    const code = await main(['clena'], tmpDir)
    expect(code).toBe(2)
  })

  it('treats a bare leading flag as no command, reaching the fallback rather than being rejected', async () => {
    // `command` is '--json' here, which starts with '-': the unknown-command
    // guard must not reject it, so this falls through to the same non-TTY
    // fallback as `main([])`.
    const originalIsTTY = process.stdin.isTTY
    try {
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
      const code = await main(['--json'], tmpDir)
      expect(code).toBe(0)
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true })
    }
  })

  it('accepts --json for clean, not only for check', async () => {
    writeFileSync(join(tmpDir, 'file.ts'), 'export const x = 1\nconsole.log("agent test");\n')
    const code = await main(['clean', '--dry-run', '--json'], tmpDir)
    expect(code).toBe(0)
  })

  it('counts lines and files consistently in clean output', async () => {
    // A scratch file with no modified-file findings alongside it: the old
    // wording divided by summary.modifiedFiles.length unconditionally, which
    // printed "across 0 files" when everything purged was an unlinked file.
    // The explicit `.bak` extension scores 0.9, above the default threshold,
    // unlike a merely generic name such as temp.scratch.json (0.7).
    writeFileSync(join(tmpDir, 'debug.bak'), '{"scratch": true}\n')

    const lines: string[] = []
    const spy = spyOn(console, 'log').mockImplementation((msg: string) => {
      lines.push(String(msg))
    })
    const code = await main(['clean'], tmpDir)
    spy.mockRestore()

    const output = lines.join('\n')
    expect(code).toBe(0)
    expect(output).not.toContain('across 0 files')
    expect(output).toContain('Deleted 1 scratch files')
  })

  it('agrees with `check` on exit code for a bare, non-TTY invocation with only sub-threshold findings', async () => {
    // The suppress/ts rule scores this directive at 0.4, below the 0.8
    // default: check does not fail on it, and bare `alpheus` must not either.
    writeFileSync(
      join(tmpDir, 'legacy.ts'),
      'export function widen(x: number): unknown {\n  // @ts-expect-error waiting on upstream types\n  return x\n}\n',
    )
    await gitAddAll(tmpDir)

    const originalIsTTY = process.stdin.isTTY
    try {
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
      const bareCode = await main([], tmpDir)
      const checkCode = await main(['check'], tmpDir)
      expect(bareCode).toBe(checkCode)
      expect(bareCode).toBe(0)
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true })
    }
  })

  it('restores the named snapshot when --force appears before the id', async () => {
    const firstOriginal = 'export const x = 1\nconsole.log("first")\n'
    writeFileSync(join(tmpDir, 'file.ts'), firstOriginal)
    expect(await main(['clean'], tmpDir)).toBe(0)

    writeFileSync(
      join(tmpDir, 'file.ts'),
      'export const x = 1\nconsole.log("first")\nconsole.log("second")\n',
    )
    expect(await main(['clean'], tmpDir)).toBe(0)

    // Drift after the second purge, so restoring the first snapshot without
    // --force would conflict and refuse.
    writeFileSync(
      join(tmpDir, 'file.ts'),
      `${readFileSync(join(tmpDir, 'file.ts'), 'utf-8')}export const y = 2\n`,
    )

    const { listBackups } = await import('../src/safety/backup.ts')
    const manifests = await listBackups(tmpDir)
    expect(manifests.length).toBe(2)
    const oldestId = manifests[manifests.length - 1].id

    const code = await main(['restore', '--force', oldestId], tmpDir)
    expect(code).toBe(0)
    expect(readFileSync(join(tmpDir, 'file.ts'), 'utf-8')).toBe(firstOriginal)
  })

  it('documents --min-confidence in help output', async () => {
    const lines: string[] = []
    const spy = spyOn(console, 'log').mockImplementation((msg: string) => {
      lines.push(String(msg))
    })
    const code = await main(['help'], tmpDir)
    spy.mockRestore()

    expect(code).toBe(0)
    expect(lines.join('\n')).toContain('--min-confidence')
  })
})
