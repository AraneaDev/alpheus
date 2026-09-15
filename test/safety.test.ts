import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { MiasmaItem } from '../src/scanner/types.ts'
import { createSafetyBackup, listBackups } from '../src/safety/backup.ts'
import { restoreBackup } from '../src/safety/restore.ts'

const TEST_DIR = join(import.meta.dir, 'tmp_safety_test')

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

    // Run restore
    const restored = await restoreBackup(TEST_DIR, manifest.id)
    expect(restored.length).toBe(2)

    expect(readFileSync(join(TEST_DIR, 'src/main.ts'), 'utf-8')).toBe(originalMain)
    expect(existsSync(join(TEST_DIR, 'scratch.py'))).toBe(true)
    expect(readFileSync(join(TEST_DIR, 'scratch.py'), 'utf-8')).toBe(originalScratch)
  })
})

describe('snapshot identity and retention', () => {
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

    const now = new Date()
    const pad = (n: number) => n.toString().padStart(2, '0')
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const collidingId = `${dateStr}_aaaa`
    mkdirSync(join(TEST_DIR, '.alpheus/backups', collidingId), { recursive: true })

    const randomSpy = spyOn(Math, 'random')
    randomSpy.mockReturnValueOnce(0xaaaa / 0x10000)

    try {
      const manifest = await createSafetyBackup(TEST_DIR, [item])
      expect(manifest.id).not.toBe(collidingId)
    } finally {
      randomSpy.mockRestore()
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

    const now = new Date()
    const pad = (n: number) => n.toString().padStart(2, '0')
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    mkdirSync(join(TEST_DIR, '.alpheus/backups', `${dateStr}_aaaa`), { recursive: true })

    const randomSpy = spyOn(Math, 'random')
    randomSpy.mockReturnValue(0xaaaa / 0x10000)

    try {
      await expect(createSafetyBackup(TEST_DIR, [item])).rejects.toThrow()
    } finally {
      randomSpy.mockRestore()
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
    writeFileSync(join(TEST_DIR, '.git'), 'gitdir: /elsewhere/.git/worktrees/x\n')

    const manifest = await createSafetyBackup(TEST_DIR, [item])
    expect(manifest.id).toBeDefined()
  })
})
