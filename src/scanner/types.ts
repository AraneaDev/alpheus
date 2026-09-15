/**
 * The five core categories of agent pollution (miasma).
 */
export type MiasmaCategory = 'LOG' | 'SUPPRESS' | 'SCRATCH' | 'TOMBSTONE' | 'PATH'

/**
 * A contiguous range of source lines, carrying the exact text that was matched.
 *
 * The text is what makes a finding verifiable: the mutator will refuse to
 * delete a range whose lines no longer match what the rule saw.
 */
export interface SourceSpan {
  startLine: number
  endLine: number
  lines: string[]
}

/**
 * A discrete finding of agent pollution in the working tree.
 */
export interface MiasmaItem {
  id: string
  filePath: string
  category: MiasmaCategory
  ruleId: string
  span?: SourceSpan
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
  unverifiable: {
    filePath: string
    startLine?: number
    reason: string
  }[]
}
