import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import type { BackupManifest } from '../scanner/types.ts'
import { listBackups } from './backup.ts'

/**
 * Restores modified and unlinked files from a backup snapshot.
 *
 * @param cwd - Repository root directory.
 * @param snapshotId - Optional specific snapshot ID; defaults to the latest backup.
 * @returns Array of restored file relative paths.
 */
export async function restoreBackup(cwd: string, snapshotId?: string): Promise<string[]> {
  let targetId = snapshotId

  if (!targetId) {
    const existing = await listBackups(cwd)
    if (existing.length === 0) {
      throw new Error('No backups found in .alpheus/backups/')
    }
    targetId = existing[0].id
  }

  const backupDir = join(cwd, '.alpheus/backups', targetId)
  const manifestPath = join(backupDir, 'manifest.json')

  if (!existsSync(manifestPath)) {
    throw new Error(`Backup snapshot not found: ${targetId}`)
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as BackupManifest
  const restoredPaths: string[] = []

  for (const file of manifest.files) {
    const backupFilePath = join(backupDir, file.backupRelPath)
    const destFilePath = join(cwd, file.originalPath)

    if (existsSync(backupFilePath)) {
      mkdirSync(dirname(destFilePath), { recursive: true })
      copyFileSync(backupFilePath, destFilePath)
      restoredPaths.push(file.originalPath)
    }
  }

  return restoredPaths
}
