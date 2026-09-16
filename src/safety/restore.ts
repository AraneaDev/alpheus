import { createHash } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { dirname, join, resolve, sep } from 'path'
import type { BackupManifest, BackupManifestFile } from '../scanner/types.ts'
import { listBackups } from './backup.ts'

/**
 * Options controlling restore behavior.
 */
export interface RestoreOptions {
  force?: boolean
}

/**
 * A manifest entry that has been validated and is safe to copy back.
 */
interface PlannedRestore {
  originalPath: string
  destFilePath: string
  backupFilePath: string
}

/**
 * Determines whether restoring `file` over the current working tree would
 * discard work done since the purge.
 *
 * An `unlink` entry never carries `sha256After`, because the purge deleted
 * the file and there was nothing left to hash. That absence is itself the
 * baseline: anything found at `destFilePath` now was created after the
 * purge, so its mere presence is the conflict, not a hash mismatch.
 *
 * A `modify` entry is compared against the hash recorded right after the
 * purge. A missing file is not a conflict, since there is nothing on disk to
 * overwrite. A missing hash on a file that does exist is a conflict, the
 * same conservative call already made for `unlink` entries above: it means
 * `finalizeSafetyBackup` never got to write it, typically because a later
 * file's write threw and aborted the mutation loop partway through. Treating
 * that as "no conflict" would let a later restore silently overwrite
 * whatever purgeMiasma already wrote to disk, with no way to tell it apart
 * from work done since.
 *
 * @param file - The manifest entry describing the original file and its
 *   recorded post-purge hash.
 * @param destFilePath - Absolute path of the file's current location.
 * @returns True if restoring would overwrite content the purge did not produce.
 */
function hasConflict(file: BackupManifestFile, destFilePath: string): boolean {
  if (file.action === 'unlink') {
    return existsSync(destFilePath)
  }

  if (!existsSync(destFilePath)) return false
  if (!file.sha256After) return true

  const current = createHash('sha256').update(readFileSync(destFilePath)).digest('hex')
  return current !== file.sha256After
}

/**
 * Restores modified and unlinked files from a backup snapshot.
 *
 * Restoring is two-pass: every manifest entry is first resolved and checked
 * for conflicts against the current working tree, and only once the whole
 * set is known to be safe does the second pass copy anything back. A
 * refused restore therefore changes nothing at all, rather than leaving the
 * tree partly restored with an error naming only the file it happened to
 * reach first.
 *
 * A file is restored only if it is unchanged since the purge that created
 * the backup (see {@link hasConflict}). A file that conflicts is left alone
 * and reported rather than silently overwritten, unless `options.force` is
 * set, which bypasses the conflict check but never the path-traversal
 * rejection below.
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
  const conflicts: string[] = []
  const planned: PlannedRestore[] = []

  for (const file of manifest.files) {
    const destFilePath = resolve(cwd, file.originalPath)

    if (!destFilePath.startsWith(resolve(cwd) + sep) && destFilePath !== resolve(cwd)) {
      throw new Error(`Backup manifest points outside the repository: ${file.originalPath}`)
    }

    const backupFilePath = join(backupDir, file.backupRelPath)
    if (!existsSync(backupFilePath)) continue

    if (!options?.force && hasConflict(file, destFilePath)) {
      conflicts.push(file.originalPath)
      continue
    }

    planned.push({ originalPath: file.originalPath, destFilePath, backupFilePath })
  }

  if (conflicts.length > 0) {
    throw new Error(
      `Refusing to restore: these files have changed since the purge and restoring would discard that work:\n` +
        conflicts.map((c) => `  - ${c}`).join('\n') +
        `\nRe-run with --force to restore anyway.`,
    )
  }

  const restoredPaths: string[] = []
  for (const { originalPath, destFilePath, backupFilePath } of planned) {
    mkdirSync(dirname(destFilePath), { recursive: true })
    copyFileSync(backupFilePath, destFilePath)
    restoredPaths.push(originalPath)
  }

  return restoredPaths
}
