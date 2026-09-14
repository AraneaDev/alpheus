import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { main } from '../src/cli.ts'

describe('CLI Commands Dispatching', () => {
  const originalCwd = process.cwd()
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

    process.chdir(tmpDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should handle help command and return 0', async () => {
    const code = await main(['help'])
    expect(code).toBe(0)
  })

  it('should handle default no-arg invocation in non-TTY mode and return 0 for clean repo', async () => {
    const code = await main([])
    expect(code).toBe(0)
  })

  it('should handle default no-arg invocation in non-TTY mode and return 1 when miasma is present', async () => {
    writeFileSync(join(tmpDir, 'file.ts'), 'export const x = 1\nconsole.log("miasma");\n')
    const originalIsTTY = process.stdin.isTTY
    try {
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
      const code = await main([])
      expect(code).toBe(1)
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true })
    }
  })

  it('should return 0 for check in a clean repository', async () => {
    const code = await main(['check'])
    expect(code).toBe(0)
  })

  it('should return 0 for check with --json and --quiet flags', async () => {
    const codeJson = await main(['check', '--json'])
    expect(codeJson).toBe(0)

    const codeQuiet = await main(['check', '--quiet'])
    expect(codeQuiet).toBe(0)
  })

  it('should return 0 for clean in a clean repository', async () => {
    const code = await main(['clean'])
    expect(code).toBe(0)
  })

  it('should return 0 for backups when no backups exist', async () => {
    const code = await main(['backups'])
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
    const code = await main(['restore', 'missing_id_1234'])
    expect(code).toBe(2)
  })

  it('should detect miasma and support dry-run, clean, backups, and restore lifecycle', async () => {
    // Add debug log to file.ts
    writeFileSync(join(tmpDir, 'file.ts'), 'export const x = 1\nconsole.log("agent test");\n')
    writeFileSync(join(tmpDir, 'temp.scratch.json'), '{"scratch": true}\n')

    // 1. check detects miasma -> exit 1
    const checkCode = await main(['check'])
    expect(checkCode).toBe(1)

    // 2. clean --dry-run
    const dryRunCode = await main(['clean', '--dry-run'])
    expect(dryRunCode).toBe(0)

    // 3. clean
    const cleanCode = await main(['clean'])
    expect(cleanCode).toBe(0)

    // 4. verify clean state after purge
    const checkAfterClean = await main(['check'])
    expect(checkAfterClean).toBe(0)

    // 5. list backups
    const backupsCode = await main(['backups'])
    expect(backupsCode).toBe(0)

    // 6. restore
    const restoreCode = await main(['restore'])
    expect(restoreCode).toBe(0)

    // 7. verify items returned after restore
    const checkAfterRestore = await main(['check'])
    expect(checkAfterRestore).toBe(1)
  })
})
