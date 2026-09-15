import { createHash } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { dirname, join, resolve, sep } from 'path'
import type { BackupManifest } from '../scanner/types.ts'
import { listBackups } from './backup.ts'

/**
 * Options controlling restore behavior.
 */
export interface RestoreOptions {
  force?: boolean
}

/**
 * Restores modified and unlinked files from a backup snapshot.
 *
 * Each file is restored only if it is unchanged since the purge that
 * created the backup, verified against the `sha256After` hash recorded by
 * `finalizeSafetyBackup`. A file edited since the purge is left alone and
 * reported as a conflict rather than silently overwritten, unless
 * `options.force` is set.
 *
 * @param cwd - Repository root directory.
 * @param snapshotId - Optional specific snapshot ID; defaults to the latest backup.
 * @param options - Restore options (force).
 * @returns Array of restored file relative paths.
 */
export async function restoreBackup(
  cwd: string,
  snapshotId?: string,
  options?: RestoreOptions,
): Promise<string[]> {
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
  const conflicts: string[] = []

  for (const file of manifest.files) {
    const destFilePath = resolve(cwd, file.originalPath)

    if (!destFilePath.startsWith(resolve(cwd) + sep) && destFilePath !== resolve(cwd)) {
      throw new Error(`Backup manifest points outside the repository: ${file.originalPath}`)
    }

    const backupFilePath = join(backupDir, file.backupRelPath)
    if (!existsSync(backupFilePath)) continue

    if (!options?.force && file.sha256After && existsSync(destFilePath)) {
      const current = createHash('sha256').update(readFileSync(destFilePath)).digest('hex')
      if (current !== file.sha256After) {
        conflicts.push(file.originalPath)
        continue
      }
    }

    mkdirSync(dirname(destFilePath), { recursive: true })
    copyFileSync(backupFilePath, destFilePath)
    restoredPaths.push(file.originalPath)
  }

  if (conflicts.length > 0) {
    throw new Error(
      `Refusing to restore: these files have changed since the purge and restoring would discard that work:\n` +
        conflicts.map((c) => `  - ${c}`).join('\n') +
        `\nRe-run with --force to restore anyway.`,
    )
  }

  return restoredPaths
}
