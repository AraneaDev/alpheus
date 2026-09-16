import { afterEach, beforeEach, describe, expect, it, setSystemTime, spyOn } from 'bun:test'
import * as fsModule from 'fs'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { BackupManifest, MiasmaItem } from '../src/scanner/types.ts'
import { createSafetyBackup, finalizeSafetyBackup, listBackups } from '../src/safety/backup.ts'
import { purgeMiasma } from '../src/safety/mutator.ts'
import { restoreBackup } from '../src/safety/restore.ts'

const TEST_DIR = join(import.meta.dir, 'tmp_safety_test')

/**
 * Reproduces the compact date prefix `generateSnapshotId` derives from the
 * (possibly mocked) system clock, so a test can predict a colliding id.
 */
function snapshotDateStr(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

describe('Safety Backup & Restore Protocol', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
    mkdirSync(join(TEST_DIR, 'src'), { recursive: true })
    writeFileSync(join(TEST_DIR, 'src/main.ts'), 'console.log("hello");\nconst x = 1;\n')
    writeFileSync(join(TEST_DIR, 'scratch.py'), 'print("temp")\n')
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('should create an atomic backup with manifest and copies of affected files', async () => {
    const items: MiasmaItem[] = [
      {
        id: 'log-aaaaaaaaaaaa',
        filePath: 'src/main.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        span: { startLine: 1, endLine: 1, lines: ['console.log("hello");'] },
        explanation: 'Debug log',
        confidence: 1,
      },
      {
        id: 'scratch-bbbbbbbbbbbb',
        filePath: 'scratch.py',
        category: 'SCRATCH',
        ruleId: 'scratch/untracked',
        explanation: 'Scratch file',
        confidence: 1,
      },
    ]

    const manifest = await createSafetyBackup(TEST_DIR, items)
    expect(manifest.id).toBeDefined()
    expect(manifest.files.length).toBe(2)

    const backupDir = join(TEST_DIR, '.alpheus/backups', manifest.id)
    expect(existsSync(join(backupDir, 'manifest.json'))).toBe(true)
    expect(existsSync(join(backupDir, 'src/main.ts'))).toBe(true)
    expect(existsSync(join(backupDir, 'scratch.py'))).toBe(true)

    const backups = await listBackups(TEST_DIR)
    expect(backups.length).toBe(1)
    expect(backups[0].id).toBe(manifest.id)
  })

  it('should restore modified and unlinked files byte-for-byte from backup', async () => {
    const originalMain = readFileSync(join(TEST_DIR, 'src/main.ts'), 'utf-8')
    const originalScratch = readFileSync(join(TEST_DIR, 'scratch.py'), 'utf-8')

    const items: MiasmaItem[] = [
      {
        id: 'log-aaaaaaaaaaaa',
        filePath: 'src/main.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        span: { startLine: 1, endLine: 1, lines: ['console.log("hello");'] },
        explanation: 'Debug log',
        confidence: 1,
      },
      {
        id: 'scratch-bbbbbbbbbbbb',
        filePath: 'scratch.py',
        category: 'SCRATCH',
        ruleId: 'scratch/untracked',
        explanation: 'Scratch file',
        confidence: 1,
      },
    ]

    const manifest = await createSafetyBackup(TEST_DIR, items)

    // Simulate mutation: mutate src/main.ts and delete scratch.py
    writeFileSync(join(TEST_DIR, 'src/main.ts'), 'const x = 1;\n')
    rmSync(join(TEST_DIR, 'scratch.py'))
    expect(existsSync(join(TEST_DIR, 'scratch.py'))).toBe(false)

    // As the real purge does: record sha256After once mutation is done, so
    // the restore below has something to compare the untouched file against.
    finalizeSafetyBackup(TEST_DIR, manifest)

    // Run restore
    const restored = await restoreBackup(TEST_DIR, manifest.id)
    expect(restored.length).toBe(2)

    expect(readFileSync(join(TEST_DIR, 'src/main.ts'), 'utf-8')).toBe(originalMain)
    expect(existsSync(join(TEST_DIR, 'scratch.py'))).toBe(true)
    expect(readFileSync(join(TEST_DIR, 'scratch.py'), 'utf-8')).toBe(originalScratch)
  })
})

describe('snapshot identity and retention', () => {
  afterEach(() => {
    // Defensive: a test that threw before its own finally block could leave
    // the clock frozen or stray directories behind for the next test/file.
    setSystemTime()
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('never reuses a snapshot directory', async () => {
    const item: MiasmaItem = {
      id: 'log-1',
      filePath: 'src/main.ts',
      category: 'LOG',
      ruleId: 'log/typescript',
      span: { startLine: 1, endLine: 1, lines: ['console.log("hello");'] },
      explanation: 'Debug log',
      confidence: 1,
    }

    const ids = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const manifest = await createSafetyBackup(TEST_DIR, [item])
      ids.add(manifest.id)
    }

    expect(ids.size).toBe(40)
  })

  it('keeps only the most recent 20 snapshots', async () => {
    const item: MiasmaItem = {
      id: 'log-1',
      filePath: 'src/main.ts',
      category: 'LOG',
      ruleId: 'log/typescript',
      span: { startLine: 1, endLine: 1, lines: ['console.log("hello");'] },
      explanation: 'Debug log',
      confidence: 1,
    }

    for (let i = 0; i < 25; i++) {
      await createSafetyBackup(TEST_DIR, [item])
    }

    expect((await listBackups(TEST_DIR)).length).toBe(20)
  })

  it('retries the snapshot id when the directory already exists', async () => {
    const item: MiasmaItem = {
      id: 'log-1',
      filePath: 'src/main.ts',
      category: 'LOG',
      ruleId: 'log/typescript',
      span: { startLine: 1, endLine: 1, lines: ['console.log("hello");'] },
      explanation: 'Debug log',
      confidence: 1,
    }

    // The clock is frozen so the id `generateSnapshotId` computes inside
    // createSafetyBackup is guaranteed, not merely likely, to match the
    // directory pre-created here: no wall-clock second boundary can slip
    // between the two.
    const frozen = new Date('2030-06-15T12:00:00.000Z')
    setSystemTime(frozen)

    try {
      const dateStr = snapshotDateStr(frozen)
      const collidingId = `${dateStr}_aaaa`
      mkdirSync(join(TEST_DIR, '.alpheus/backups', collidingId), { recursive: true })

      const randomSpy = spyOn(Math, 'random')
      // First call reproduces the pre-created id and must collide; the second
      // is pinned to a different value so the retry is guaranteed to succeed
      // rather than merely likely to, closing the same gap as the frozen clock.
      randomSpy.mockReturnValueOnce(0xaaaa / 0x10000).mockReturnValueOnce(0x1234 / 0x10000)

      try {
        const manifest = await createSafetyBackup(TEST_DIR, [item])
        expect(manifest.id).toBe(`${dateStr}_1234`)
        expect(manifest.id).not.toBe(collidingId)
      } finally {
        randomSpy.mockRestore()
      }
    } finally {
      setSystemTime()
    }
  })

  it('throws once every retry attempt collides', async () => {
    const item: MiasmaItem = {
      id: 'log-1',
      filePath: 'src/main.ts',
      category: 'LOG',
      ruleId: 'log/typescript',
      span: { startLine: 1, endLine: 1, lines: ['console.log("hello");'] },
      explanation: 'Debug log',
      confidence: 1,
    }

    const frozen = new Date('2030-06-15T12:00:00.000Z')
    setSystemTime(frozen)

    try {
      const dateStr = snapshotDateStr(frozen)
      mkdirSync(join(TEST_DIR, '.alpheus/backups', `${dateStr}_aaaa`), { recursive: true })

      const randomSpy = spyOn(Math, 'random')
      // Every attempt reproduces the same id, so the loop is guaranteed to
      // exhaust its 10 retries and throw rather than happening to succeed.
      randomSpy.mockReturnValue(0xaaaa / 0x10000)

      try {
        await expect(createSafetyBackup(TEST_DIR, [item])).rejects.toThrow()
      } finally {
        randomSpy.mockRestore()
      }
    } finally {
      setSystemTime()
    }
  })

  it('does not fail a purge when a stale snapshot cannot be deleted', async () => {
    const item: MiasmaItem = {
      id: 'log-1',
      filePath: 'src/main.ts',
      category: 'LOG',
      ruleId: 'log/typescript',
      span: { startLine: 1, endLine: 1, lines: ['console.log("hello");'] },
      explanation: 'Debug log',
      confidence: 1,
    }

    for (let i = 0; i < 21; i++) {
      await createSafetyBackup(TEST_DIR, [item])
    }

    // The next backup pushes the retained count past 20, giving pruning at
    // least one stale directory to remove. Fail the first removal attempt to
    // prove pruning's own housekeeping errors cannot abort the purge.
    const rmSpy = spyOn(fsModule, 'rmSync')
    rmSpy.mockImplementationOnce(() => {
      throw Object.assign(new Error('EPERM: simulated'), { code: 'EPERM' })
    })

    try {
      const manifest = await createSafetyBackup(TEST_DIR, [item])
      expect(manifest.id).toBeDefined()
    } finally {
      rmSpy.mockRestore()
    }
  })

  it('does not fail a purge when .git is a file it cannot descend into', async () => {
    const item: MiasmaItem = {
      id: 'log-1',
      filePath: 'src/main.ts',
      category: 'LOG',
      ruleId: 'log/typescript',
      span: { startLine: 1, endLine: 1, lines: ['console.log("hello");'] },
      explanation: 'Debug log',
      confidence: 1,
    }

    // A linked worktree's .git is a file pointing at the real gitdir, not a
    // directory, so descending into it to create .git/info must not throw.
    mkdirSync(TEST_DIR, { recursive: true })
    writeFileSync(join(TEST_DIR, '.git'), 'gitdir: /elsewhere/.git/worktrees/x\n')

    const manifest = await createSafetyBackup(TEST_DIR, [item])
    expect(manifest.id).toBeDefined()
  })
})

describe('prune cannot outrun finalize (end-to-end)', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
    mkdirSync(join(TEST_DIR, 'src'), { recursive: true })
    writeFileSync(join(TEST_DIR, 'src/main.ts'), 'console.log("hello");\nconst x = 1;\n')
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('keeps the snapshot a real purge created, finalized, after pruning drops older ones', async () => {
    const item: MiasmaItem = {
      id: 'log-1',
      filePath: 'src/main.ts',
      category: 'LOG',
      ruleId: 'log/typescript',
      span: { startLine: 1, endLine: 1, lines: ['console.log("hello");'] },
      explanation: 'Debug log',
      confidence: 1,
    }

    // Seed more than RETAIN_SNAPSHOTS pre-existing backups, so the real
    // purge below has to prune an older snapshot to stay at 20, right
    // alongside creating and finalizing its own.
    for (let i = 0; i < 21; i++) {
      await createSafetyBackup(TEST_DIR, [item])
    }
    expect((await listBackups(TEST_DIR)).length).toBe(20)

    const summary = await purgeMiasma(TEST_DIR, [item])

    // The snapshot this purge created must still be on disk: pruning runs
    // inside createSafetyBackup, before the mutation and before
    // finalizeSafetyBackup ever runs, so if pruning ever regressed to treat
    // the just-created snapshot as eligible, this would be the directory it
    // deletes.
    const backupDir = join(TEST_DIR, '.alpheus/backups', summary.backupId)
    expect(existsSync(backupDir)).toBe(true)

    // Directory survival alone would also be true if finalizeSafetyBackup had
    // silently failed to find it, or if the create/mutate/finalize calls in
    // purgeMiasma were reordered so finalize ran against a manifest that no
    // longer matched the on-disk snapshot. Requiring sha256After proves
    // finalization actually landed on the snapshot that survived pruning.
    const manifestRaw = readFileSync(join(backupDir, 'manifest.json'), 'utf-8')
    const manifest = JSON.parse(manifestRaw) as BackupManifest
    expect(manifest.files.length).toBeGreaterThan(0)
    for (const file of manifest.files) {
      expect(file.sha256After).toBeDefined()
    }

    // The 22nd snapshot on disk (21 seeded plus this purge's own) still
    // prunes down to 20, confirming pruning did its job around the
    // untouchable fresh snapshot rather than skipping it entirely.
    expect((await listBackups(TEST_DIR)).length).toBe(20)
  })
})
