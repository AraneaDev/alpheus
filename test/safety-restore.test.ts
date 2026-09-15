import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createSafetyBackup, listBackups } from '../src/safety/backup.ts'
import { purgeMiasma } from '../src/safety/mutator.ts'
import { restoreBackup } from '../src/safety/restore.ts'
import { theme } from '../src/tui/theme.ts'
import type { BackupManifest, MiasmaCategory, MiasmaItem } from '../src/scanner/types.ts'

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

describe('restore verification', () => {
  const TEST_DIR = join('/tmp', `alpheus-restore-verify-${Date.now()}`)

  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('records sha256After once the purge has run', async () => {
    writeFileSync(join(TEST_DIR, 'app.ts'), 'const a = 1\nconsole.log(a)\n')

    const summary = await purgeMiasma(TEST_DIR, [
      {
        id: 'log-1',
        filePath: 'app.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        span: { startLine: 2, endLine: 2, lines: ['console.log(a)'] },
        explanation: 'Debug log',
        confidence: 1,
      },
    ])

    const manifestPath = join(TEST_DIR, '.alpheus/backups', summary.backupId, 'manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as BackupManifest

    expect(manifest.files[0].sha256Before).toBeDefined()
    expect(manifest.files[0].sha256After).toBeDefined()
    expect(manifest.files[0].sha256After).not.toBe(manifest.files[0].sha256Before)
  })

  it('refuses to restore over a file edited since the purge', async () => {
    writeFileSync(join(TEST_DIR, 'app.ts'), 'const a = 1\nconsole.log(a)\n')

    await purgeMiasma(TEST_DIR, [
      {
        id: 'log-1',
        filePath: 'app.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        span: { startLine: 2, endLine: 2, lines: ['console.log(a)'] },
        explanation: 'Debug log',
        confidence: 1,
      },
    ])

    // An hour of work after the purge.
    writeFileSync(join(TEST_DIR, 'app.ts'), 'const a = 1\nconst valuable = work()\n')

    await expect(restoreBackup(TEST_DIR)).rejects.toThrow(/app\.ts/)
    expect(readFileSync(join(TEST_DIR, 'app.ts'), 'utf-8')).toContain('valuable')
  })

  it('restores over an edited file when forced', async () => {
    writeFileSync(join(TEST_DIR, 'app.ts'), 'const a = 1\nconsole.log(a)\n')

    await purgeMiasma(TEST_DIR, [
      {
        id: 'log-1',
        filePath: 'app.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        span: { startLine: 2, endLine: 2, lines: ['console.log(a)'] },
        explanation: 'Debug log',
        confidence: 1,
      },
    ])

    writeFileSync(join(TEST_DIR, 'app.ts'), 'const a = 1\nsomething else\n')
    const restored = await restoreBackup(TEST_DIR, undefined, { force: true })

    expect(restored).toContain('app.ts')
    expect(readFileSync(join(TEST_DIR, 'app.ts'), 'utf-8')).toContain('console.log(a)')
  })

  it('restores cleanly when nothing has changed since the purge', async () => {
    writeFileSync(join(TEST_DIR, 'app.ts'), 'const a = 1\nconsole.log(a)\n')

    await purgeMiasma(TEST_DIR, [
      {
        id: 'log-1',
        filePath: 'app.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        span: { startLine: 2, endLine: 2, lines: ['console.log(a)'] },
        explanation: 'Debug log',
        confidence: 1,
      },
    ])

    const restored = await restoreBackup(TEST_DIR)
    expect(restored).toContain('app.ts')
    expect(readFileSync(join(TEST_DIR, 'app.ts'), 'utf-8')).toContain('console.log(a)')
  })

  it('rejects a manifest whose originalPath escapes the repository', async () => {
    const id = 'evil_snapshot'
    const dir = join(TEST_DIR, '.alpheus/backups', id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'payload'), 'pwned\n')
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        version: '1.0',
        id,
        timestamp: new Date().toISOString(),
        workingDirectory: TEST_DIR,
        files: [{ originalPath: '../../escaped.txt', backupRelPath: 'payload', action: 'modify' }],
      }),
    )

    await expect(restoreBackup(TEST_DIR, id)).rejects.toThrow(/outside the repository/)
  })

  it('refuses to restore over a new file created where a purged file was deleted', async () => {
    writeFileSync(join(TEST_DIR, 'debug.tmp'), 'throwaway\n')

    await purgeMiasma(TEST_DIR, [
      {
        id: 'scratch-1',
        filePath: 'debug.tmp',
        category: 'SCRATCH',
        ruleId: 'scratch/untracked',
        explanation: 'Scratch file',
        confidence: 1,
      },
    ])

    expect(existsSync(join(TEST_DIR, 'debug.tmp'))).toBe(false)

    // Unrelated real work lands at the same path after the purge.
    writeFileSync(join(TEST_DIR, 'debug.tmp'), 'real work\n')

    await expect(restoreBackup(TEST_DIR)).rejects.toThrow(/debug\.tmp/)
    expect(readFileSync(join(TEST_DIR, 'debug.tmp'), 'utf-8')).toBe('real work\n')

    const restored = await restoreBackup(TEST_DIR, undefined, { force: true })
    expect(restored).toContain('debug.tmp')
    expect(readFileSync(join(TEST_DIR, 'debug.tmp'), 'utf-8')).toBe('throwaway\n')
  })

  it('leaves non-conflicting files untouched when another file in the same restore conflicts', async () => {
    writeFileSync(join(TEST_DIR, 'safe.ts'), 'const a = 1\nconsole.log(a)\n')
    writeFileSync(join(TEST_DIR, 'conflict.ts'), 'const b = 1\nconsole.log(b)\n')

    await purgeMiasma(TEST_DIR, [
      {
        id: 'log-safe',
        filePath: 'safe.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        span: { startLine: 2, endLine: 2, lines: ['console.log(a)'] },
        explanation: 'Debug log',
        confidence: 1,
      },
      {
        id: 'log-conflict',
        filePath: 'conflict.ts',
        category: 'LOG',
        ruleId: 'log/typescript',
        span: { startLine: 2, endLine: 2, lines: ['console.log(b)'] },
        explanation: 'Debug log',
        confidence: 1,
      },
    ])

    // Work happens on conflict.ts only; safe.ts is left exactly as the purge left it.
    writeFileSync(join(TEST_DIR, 'conflict.ts'), 'const b = 1\nconst valuable = work()\n')

    const safeMtimeBefore = statSync(join(TEST_DIR, 'safe.ts')).mtimeMs

    await expect(restoreBackup(TEST_DIR)).rejects.toThrow(/conflict\.ts/)

    expect(readFileSync(join(TEST_DIR, 'conflict.ts'), 'utf-8')).toContain('valuable')
    expect(statSync(join(TEST_DIR, 'safe.ts')).mtimeMs).toBe(safeMtimeBefore)
    expect(readFileSync(join(TEST_DIR, 'safe.ts'), 'utf-8')).toBe('const a = 1\n')
  })
})
