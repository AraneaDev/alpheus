/**
 * The five core categories of agent pollution (miasma).
 */
export type MiasmaCategory = 'LOG' | 'SUPPRESS' | 'SCRATCH' | 'TOMBSTONE' | 'PATH'

/**
 * Surrounding code context for rendering diff previews.
 */
export interface ContextLine {
  line: number
  content: string
  isTarget: boolean
}

/**
 * A discrete finding of agent pollution in the working tree.
 */
export interface MiasmaItem {
  id: string
  filePath: string
  lineNumber?: number
  category: MiasmaCategory
  matchedContent: string
  contextLines?: ContextLine[]
  explanation: string
  confidence: number
}

/**
 * A line addition inside a unified diff hunk.
 */
export interface HunkLine {
  lineNumber: number
  content: string
  type: 'add' | 'context'
}

/**
 * A unified diff hunk representing additions in a modified file.
 */
export interface DiffHunk {
  filePath: string
  startLine: number
  lineCount: number
  lines: HunkLine[]
}

/**
 * Individual file record in a backup manifest.
 */
export interface BackupManifestFile {
  originalPath: string
  backupRelPath: string
  action: 'modify' | 'unlink'
  purgedLines?: number[]
  sha256Before?: string
  sha256After?: string
}

/**
 * Metadata stored in `.alpheus/backups/<id>/manifest.json`.
 */
export interface BackupManifest {
  version: string
  id: string
  timestamp: string
  workingDirectory: string
  gitHead?: string
  files: BackupManifestFile[]
}

/**
 * Result summary of a purge operation.
 */
export interface PurgeSummary {
  backupId: string
  backupPath: string
  modifiedFiles: {
    path: string
    purgedLineCount: number
  }[]
  unlinkedFiles: string[]
}
