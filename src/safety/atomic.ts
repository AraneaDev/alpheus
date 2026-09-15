import { chmodSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'

/**
 * Writes a file by rename, so an interrupted write cannot truncate the original.
 *
 * The temporary file is created in the same directory as the target, because a
 * rename across filesystems is not atomic.
 *
 * @param absPath - Absolute path to the file to replace.
 * @param content - The new contents.
 */
export function writeFileAtomic(absPath: string, content: string): void {
  const dir = dirname(absPath)
  const tmp = join(dir, `.${basename(absPath)}.alpheus-${process.pid}-${Date.now()}.tmp`)

  try {
    writeFileSync(tmp, content, 'utf-8')
    chmodSync(tmp, statSync(absPath).mode)
    renameSync(tmp, absPath)
  } catch (err) {
    try {
      unlinkSync(tmp)
    } catch {
      // The temp file may never have been created.
    }
    throw err
  }
}
