import { createHash } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { BackupManifest, BackupManifestFile, MiasmaItem } from '../scanner/types.ts'

/**
 * Computes the SHA-256 hash of a file's contents.
 */
function computeSha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Generates an ISO-like compact timestamp and random ID.
 */
function generateSnapshotId(): string {
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const rand = Math.random().toString(16).slice(2, 6)
  return `${dateStr}_${rand}`
}

/**
 * Appends `.alpheus/` to `.git/info/exclude` if git repository exists.
 */
function ensureGitExclude(cwd: string): void {
  const excludePath = join(cwd, '.git/info/exclude')
  if (existsSync(join(cwd, '.git')) && existsSync(excludePath)) {
    try {
      const content = readFileSync(excludePath, 'utf-8')
      if (!content.includes('.alpheus')) {
        writeFileSync(excludePath, `${content.trimEnd()}\n.alpheus/\n`)
      }
    } catch {
      // Ignore if permission denied or non-standard git config
    }
  }
}

/**
 * Creates an atomic safety backup before any files are modified or deleted.
 *
 * @param cwd - Repository root directory.
 * @param items - Miasma findings targeted for purging.
 * @returns The created BackupManifest.
 */
export async function createSafetyBackup(cwd: string, items: MiasmaItem[]): Promise<BackupManifest> {
  const snapshotId = generateSnapshotId()
  const backupDir = join(cwd, '.alpheus/backups', snapshotId)
  mkdirSync(backupDir, { recursive: true })
  ensureGitExclude(cwd)

  // Deduplicate files
  const fileMap = new Map<string, MiasmaItem[]>()
  for (const item of items) {
    const list = fileMap.get(item.filePath) || []
    list.push(item)
    fileMap.set(item.filePath, list)
  }

  const manifestFiles: BackupManifestFile[] = []

  for (const [relPath, fileItems] of fileMap.entries()) {
    const absPath = join(cwd, relPath)
    if (!existsSync(absPath)) continue

    const content = readFileSync(absPath)
    const shaBefore = computeSha256(content)
    const backupFilePath = join(backupDir, relPath)

    mkdirSync(dirname(backupFilePath), { recursive: true })
    copyFileSync(absPath, backupFilePath)

    const isScratch = fileItems.some((i) => i.category === 'SCRATCH')
    const purgedLines = fileItems
      .map((i) => i.span?.startLine)
      .filter((ln): ln is number => typeof ln === 'number')

    manifestFiles.push({
      originalPath: relPath,
      backupRelPath: relPath,
      action: isScratch ? 'unlink' : 'modify',
      purgedLines: purgedLines.length > 0 ? purgedLines : undefined,
      sha256Before: shaBefore,
    })
  }

  const manifest: BackupManifest = {
    version: '1.0',
    id: snapshotId,
    timestamp: new Date().toISOString(),
    workingDirectory: cwd,
    files: manifestFiles,
  }

  writeFileSync(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')

  return manifest
}

/**
 * Lists all existing backups in the repository, sorted newest first.
 *
 * @param cwd - Repository root directory.
 * @returns Array of parsed BackupManifests.
 */
export async function listBackups(cwd: string): Promise<BackupManifest[]> {
  const backupsRoot = join(cwd, '.alpheus/backups')
  if (!existsSync(backupsRoot)) return []

  const entries = readdirSync(backupsRoot)
  const manifests: BackupManifest[] = []

  for (const entry of entries) {
    const manifestPath = join(backupsRoot, entry, 'manifest.json')
    if (existsSync(manifestPath)) {
      try {
        const raw = readFileSync(manifestPath, 'utf-8')
        manifests.push(JSON.parse(raw) as BackupManifest)
      } catch {
        // Skip corrupted manifest
      }
    }
  }

  // Sort newest first by timestamp
  return manifests.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}
