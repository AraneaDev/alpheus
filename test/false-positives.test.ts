import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { evaluateWorkingTree } from '../src/engine/matcher.ts'
import { DEFAULT_MIN_CONFIDENCE, partitionByConfidence } from '../src/engine/threshold.ts'

const DIR = join(import.meta.dir, 'tmp_false_positive_test')
const FIXTURES = join(import.meta.dir, 'fixtures/clean-code')

async function git(cwd: string, ...args: string[]): Promise<void> {
  await Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' }).exited
}

describe('false positive corpus', () => {
  beforeEach(async () => {
    rmSync(DIR, { recursive: true, force: true })
    mkdirSync(DIR, { recursive: true })

    await git(DIR, 'init')
    await git(DIR, 'config', 'user.name', 'Tester')
    await git(DIR, 'config', 'user.email', 'tester@example.com')

    // A base commit, so the fixtures show up as additions in a diff.
    writeFileSync(join(DIR, '.keep'), '')
    await git(DIR, 'add', '-A')
    await git(DIR, 'commit', '-m', 'initial')

    cpSync(FIXTURES, DIR, { recursive: true })
    await git(DIR, 'add', '-A')
  })

  afterEach(() => {
    rmSync(DIR, { recursive: true, force: true })
  })

  it('finds nothing actionable in legitimate code', async () => {
    const items = await evaluateWorkingTree(DIR)
    const { actionable } = partitionByConfidence(items, DEFAULT_MIN_CONFIDENCE)

    const detail = actionable
      .map((i) => `${i.filePath}:${i.span?.startLine} [${i.ruleId}] ${i.explanation}`)
      .join('\n')

    expect(actionable, `unexpected findings:\n${detail}`).toHaveLength(0)
  })
})
