import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
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
        id: '1',
        filePath: 'src/main.ts',
        lineNumber: 1,
        category: 'LOG',
        matchedContent: 'console.log("hello");',
        explanation: 'Debug log',
        confidence: 1,
      },
      {
        id: '2',
        filePath: 'scratch.py',
        category: 'SCRATCH',
        matchedContent: 'scratch.py',
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
        id: '1',
        filePath: 'src/main.ts',
        lineNumber: 1,
        category: 'LOG',
        matchedContent: 'console.log("hello");',
        explanation: 'Debug log',
        confidence: 1,
      },
      {
        id: '2',
        filePath: 'scratch.py',
        category: 'SCRATCH',
        matchedContent: 'scratch.py',
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
