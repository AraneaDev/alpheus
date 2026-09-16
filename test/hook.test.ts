import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { handlePreTool, main, readAll } from '../src/hooks/pre-tool-use.ts'

async function* toAsyncIterable(chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  for (const chunk of chunks) yield chunk
}

const DIR = join('/tmp', `alpheus-hook-test-${Date.now()}`)

async function gitAdd(cwd: string, path: string): Promise<void> {
  await Bun.spawn(['git', 'add', path], { cwd, stdout: 'pipe', stderr: 'pipe' }).exited
}

async function initRepo(dir: string): Promise<void> {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  await Bun.spawn(['git', 'init'], { cwd: dir, stdout: 'pipe', stderr: 'pipe' }).exited
  await Bun.spawn(['git', 'config', 'user.name', 'Tester'], { cwd: dir }).exited
  await Bun.spawn(['git', 'config', 'user.email', 'tester@example.com'], { cwd: dir }).exited
  writeFileSync(join(dir, 'base.txt'), 'base content\n')
  await Bun.spawn(['git', 'add', '.'], { cwd: dir }).exited
  await Bun.spawn(['git', 'commit', '-m', 'initial'], { cwd: dir, stdout: 'pipe', stderr: 'pipe' }).exited
}

describe('handlePreTool', () => {
  beforeEach(async () => {
    await initRepo(DIR)
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

describe('readAll', () => {
  it('returns an empty string for empty input', async () => {
    expect(await readAll(toAsyncIterable([]))).toBe('')
  })

  it('concatenates multiple chunks, including ones split mid-character', async () => {
    const encoder = new TextEncoder()
    const chunks = [encoder.encode('{"a":'), encoder.encode('1}')]

    expect(await readAll(toAsyncIterable(chunks))).toBe('{"a":1}')
  })
})

describe('main', () => {
  beforeEach(async () => {
    await initRepo(DIR)
  })

  afterEach(() => {
    rmSync(DIR, { recursive: true, force: true })
  })

  it('reads an empty stream and defers to handlePreTool, which exits 0', async () => {
    const result = await main(toAsyncIterable([]), DIR)

    expect(result.exitCode).toBe(0)
    expect(result.message).toBe('')
  })

  it('reads a multi-chunk stream carrying a blocking commit', async () => {
    writeFileSync(join(DIR, 'app.ts'), 'const a = 1\nconsole.log(a)\n')
    await gitAdd(DIR, 'app.ts')

    const encoder = new TextEncoder()
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' }, cwd: DIR })
    const mid = Math.floor(payload.length / 2)
    const chunks = [encoder.encode(payload.slice(0, mid)), encoder.encode(payload.slice(mid))]

    const result = await main(toAsyncIterable(chunks), '/nonexistent')

    expect(result.exitCode).toBe(2)
    expect(result.message).toContain('app.ts')
  })
})
