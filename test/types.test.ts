import { describe, expect, it } from 'bun:test'
import type {
  BackupManifest,
  DiffHunk,
  MiasmaCategory,
  MiasmaItem,
  PurgeSummary,
  SourceSpan,
} from '../src/scanner/types.ts'

describe('Core Domain Types', () => {
  it('should instantiate a valid MiasmaItem and SourceSpan', () => {
    const span: SourceSpan = {
      startLine: 41,
      endLine: 43,
      lines: ['const a = 1', 'console.log("debug")', 'return a'],
    }
    const item: MiasmaItem = {
      id: 'item-1',
      filePath: 'src/index.ts',
      category: 'LOG',
      ruleId: 'log/typescript',
      span,
      explanation: 'Ephemeral debug print',
      confidence: 1.0,
    }

    expect(item.category).toBe('LOG')
    expect(item.span?.startLine).toBe(41)
  })

  it('should instantiate all MiasmaCategories', () => {
    const categories: MiasmaCategory[] = ['LOG', 'SUPPRESS', 'SCRATCH', 'TOMBSTONE', 'PATH']
    expect(categories.length).toBe(5)
  })

  it('should instantiate DiffHunk and BackupManifest structures', () => {
    const hunk: DiffHunk = {
      filePath: 'src/main.ts',
      startLine: 10,
      lineCount: 2,
      lines: [
        { lineNumber: 10, content: 'console.log("test")', type: 'add' },
      ],
    }
    expect(hunk.filePath).toBe('src/main.ts')

    const manifest: BackupManifest = {
      version: '1.0',
      id: '20260914_001',
      timestamp: new Date().toISOString(),
      workingDirectory: '/repo',
      files: [
        {
          originalPath: 'src/main.ts',
          backupRelPath: 'src/main.ts',
          action: 'modify',
          purgedLines: [10],
        },
      ],
    }
    expect(manifest.files.length).toBe(1)

    const summary: PurgeSummary = {
      backupId: manifest.id,
      backupPath: '.alpheus/backups/20260914_001',
      modifiedFiles: [{ path: 'src/main.ts', purgedLineCount: 1 }],
      unlinkedFiles: [],
      unverifiable: [],
    }
    expect(summary.modifiedFiles[0].purgedLineCount).toBe(1)
  })
})
