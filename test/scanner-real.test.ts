import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { scanGitDiff, scanUntrackedFiles } from '../src/scanner/git.ts'

describe('Git Scanner — Real Repo Integration', () => {
  const tmpDir = join('/tmp', `alpheus-git-test-${Date.now()}`)

  beforeEach(async () => {
    mkdirSync(tmpDir, { recursive: true })
    const initProc = Bun.spawn(['git', 'init'], { cwd: tmpDir })
    await initProc.exited
    const configName = Bun.spawn(['git', 'config', 'user.name', 'Tester'], { cwd: tmpDir })
    await configName.exited
    const configEmail = Bun.spawn(['git', 'config', 'user.email', 'tester@example.com'], { cwd: tmpDir })
    await configEmail.exited

    // Initial base commit
    writeFileSync(join(tmpDir, 'base.txt'), 'base content\n')
    const addProc = Bun.spawn(['git', 'add', '.'], { cwd: tmpDir })
    await addProc.exited
    const commitProc = Bun.spawn(['git', 'commit', '-m', 'initial'], { cwd: tmpDir })
    await commitProc.exited
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should scan both staged and unstaged diff additions', async () => {
    // Unstaged modification
    writeFileSync(join(tmpDir, 'base.txt'), 'base content\nconsole.log("unstaged");\n')

    // Staged new file
    writeFileSync(join(tmpDir, 'staged.js'), 'console.log("staged");\n')
    const addProc = Bun.spawn(['git', 'add', 'staged.js'], { cwd: tmpDir })
    await addProc.exited

    const hunks = await scanGitDiff(tmpDir)
    expect(hunks.length).toBeGreaterThanOrEqual(2)

    const unstagedHunk = hunks.find((h) => h.filePath === 'base.txt')
    expect(unstagedHunk).toBeDefined()
    expect(unstagedHunk?.lines.some((l) => l.content.includes('unstaged'))).toBe(true)

    const stagedHunk = hunks.find((h) => h.filePath === 'staged.js')
    expect(stagedHunk).toBeDefined()
    expect(stagedHunk?.lines.some((l) => l.content.includes('staged'))).toBe(true)
  })

  it('should scan untracked files', async () => {
    writeFileSync(join(tmpDir, 'scratch.py'), 'print("scratch")\n')
    writeFileSync(join(tmpDir, 'temp.json'), '{"temp": true}\n')

    const untracked = await scanUntrackedFiles(tmpDir)
    expect(untracked).toContain('scratch.py')
    expect(untracked).toContain('temp.json')
  })

  it('should return empty results gracefully for non-git directory', async () => {
    const nonGitDir = join('/tmp', `alpheus-nongit-${Date.now()}`)
    mkdirSync(nonGitDir, { recursive: true })

    try {
      const hunks = await scanGitDiff(nonGitDir)
      expect(hunks).toEqual([])

      const untracked = await scanUntrackedFiles(nonGitDir)
      expect(untracked).toEqual([])
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true })
    }
  })

  it('should deduplicate lines across staged and unstaged diffs', async () => {
    writeFileSync(join(tmpDir, 'dedup.txt'), 'console.log("dup");\n')
    const addProc = Bun.spawn(['git', 'add', 'dedup.txt'], { cwd: tmpDir })
    await addProc.exited

    const hunks = await scanGitDiff(tmpDir)
    const dedupHunks = hunks.filter((h) => h.filePath === 'dedup.txt')
    expect(dedupHunks.length).toBe(1)
    expect(dedupHunks[0].lines.length).toBe(1)
  })
})
