import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createSafetyBackup, listBackups } from '../src/safety/backup.ts'
import { restoreBackup } from '../src/safety/restore.ts'
import { theme } from '../src/tui/theme.ts'
import type { MiasmaCategory, MiasmaItem } from '../src/scanner/types.ts'

describe('Safety Backup & Restore Edge Cases', () => {
  const tmpDir = join('/tmp', `alpheus-safety-edge-${Date.now()}`)

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should return empty list when no backups directory exists', async () => {
    const backups = await listBackups(tmpDir)
    expect(backups).toEqual([])
  })

  it('should throw error when restoring without any existing backups', async () => {
    expect(restoreBackup(tmpDir)).rejects.toThrow('No backups found in .alpheus/backups/')
  })

  it('should throw error when restoring nonexistent snapshot ID', async () => {
    expect(restoreBackup(tmpDir, 'nonexistent_id')).rejects.toThrow('Backup snapshot not found: nonexistent_id')
  })

  it('should append .alpheus/ to .git/info/exclude when git repo exists', async () => {
    const gitInfoDir = join(tmpDir, '.git/info')
    mkdirSync(gitInfoDir, { recursive: true })
    writeFileSync(join(gitInfoDir, 'exclude'), '# Existing git exclude\n')

    const item: MiasmaItem = {
      id: 'i-1',
      filePath: 'test.ts',
      category: 'LOG',
      ruleId: 'log/typescript',
      span: { startLine: 1, endLine: 1, lines: ['console.log()'] },
      explanation: 'log',
      confidence: 1.0,
    }
    writeFileSync(join(tmpDir, 'test.ts'), 'console.log()\n')

    await createSafetyBackup(tmpDir, [item])

    const excludeContent = readFileSync(join(gitInfoDir, 'exclude'), 'utf-8')
    expect(excludeContent).toContain('.alpheus/')
  })

  it('should cover all theme category colors and fallback', () => {
    const categories: MiasmaCategory[] = ['LOG', 'SUPPRESS', 'SCRATCH', 'TOMBSTONE', 'PATH']
    for (const cat of categories) {
      expect(typeof theme.categoryColor(cat)).toBe('string')
    }
    // Unknown category fallback
    expect(theme.categoryColor('UNKNOWN' as MiasmaCategory)).toBe('white')
    expect(theme.checkbox(true)).toBe('[x]')
    expect(theme.checkbox(false)).toBe('[ ]')
  })

  it('should skip restoring manifest files that are missing from backup directory', async () => {
    const backupDir = join(tmpDir, '.alpheus/backups/test_missing')
    mkdirSync(backupDir, { recursive: true })
    const manifest = {
      id: 'test_missing',
      timestamp: new Date().toISOString(),
      cwd: tmpDir,
      files: [
        {
          originalPath: 'missing.ts',
          backupRelPath: 'missing.ts',
          action: 'modify',
        },
      ],
    }
    writeFileSync(join(backupDir, 'manifest.json'), JSON.stringify(manifest))
    const restored = await restoreBackup(tmpDir, 'test_missing')
    expect(restored).toEqual([])
  })
})
