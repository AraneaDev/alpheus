import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { handlePreTool } from '../src/hooks/pre-tool-use.ts'

const DIR = join('/tmp', `alpheus-hook-test-${Date.now()}`)

async function gitAdd(cwd: string, path: string): Promise<void> {
  await Bun.spawn(['git', 'add', path], { cwd, stdout: 'pipe', stderr: 'pipe' }).exited
}

describe('handlePreTool', () => {
  beforeEach(async () => {
    rmSync(DIR, { recursive: true, force: true })
    mkdirSync(DIR, { recursive: true })
    await Bun.spawn(['git', 'init'], { cwd: DIR, stdout: 'pipe', stderr: 'pipe' }).exited
    await Bun.spawn(['git', 'config', 'user.name', 'Tester'], { cwd: DIR }).exited
    await Bun.spawn(['git', 'config', 'user.email', 'tester@example.com'], { cwd: DIR }).exited
    writeFileSync(join(DIR, 'base.txt'), 'base content\n')
    await Bun.spawn(['git', 'add', '.'], { cwd: DIR }).exited
    await Bun.spawn(['git', 'commit', '-m', 'initial'], { cwd: DIR, stdout: 'pipe', stderr: 'pipe' }).exited
  })

  afterEach(() => {
    rmSync(DIR, { recursive: true, force: true })
    delete process.env.ALPHEUS_HOOK_MODE
  })

  it('exits 2 when a commit carries a high-confidence finding', async () => {
    writeFileSync(join(DIR, 'app.ts'), 'const a = 1\nconsole.log(a)\n')
    await gitAdd(DIR, 'app.ts')

    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' }, cwd: DIR })
    const result = await handlePreTool(payload, DIR)

    expect(result.exitCode).toBe(2)
    expect(result.message).toContain('app.ts')
  })

  it('exits 0 for a command that is not a commit', async () => {
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls -la' }, cwd: DIR })
    expect((await handlePreTool(payload, DIR)).exitCode).toBe(0)
  })

  it('exits 0 when only low-confidence findings exist', async () => {
    writeFileSync(join(DIR, 'ci.yml'), 'run: cp x /home/runner/y\n')
    await gitAdd(DIR, 'ci.yml')

    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' }, cwd: DIR })
    expect((await handlePreTool(payload, DIR)).exitCode).toBe(0)
  })

  it('respects ALPHEUS_HOOK_MODE=off', async () => {
    process.env.ALPHEUS_HOOK_MODE = 'off'
    writeFileSync(join(DIR, 'app.ts'), 'const a = 1\nconsole.log(a)\n')
    await gitAdd(DIR, 'app.ts')

    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' }, cwd: DIR })
    expect((await handlePreTool(payload, DIR)).exitCode).toBe(0)
  })

  it('warns without blocking in warn mode', async () => {
    process.env.ALPHEUS_HOOK_MODE = 'warn'
    writeFileSync(join(DIR, 'app.ts'), 'const a = 1\nconsole.log(a)\n')
    await gitAdd(DIR, 'app.ts')

    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' }, cwd: DIR })
    const result = await handlePreTool(payload, DIR)

    expect(result.exitCode).toBe(0)
    expect(result.message).toContain('app.ts')
  })

  it('uses the cwd from the payload rather than the process', async () => {
    writeFileSync(join(DIR, 'app.ts'), 'const a = 1\nconsole.log(a)\n')
    await gitAdd(DIR, 'app.ts')

    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' }, cwd: DIR })
    const result = await handlePreTool(payload, '/nonexistent')

    expect(result.exitCode).toBe(2)
  })

  it('exits 0 on malformed JSON payload rather than blocking', async () => {
    const result = await handlePreTool('{not valid json', DIR)

    expect(result.exitCode).toBe(0)
    expect(result.message).toBe('')
  })
})
