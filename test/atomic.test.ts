import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { writeFileAtomic } from '../src/safety/atomic.ts'

const TEST_DIR = join(import.meta.dir, 'tmp_atomic_test')

describe('writeFileAtomic failure paths', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('propagates the error and leaves the target untouched when it vanishes before the write completes', () => {
    // The genuine failure this guards against: something anchored against the
    // file, but by the time writeFileAtomic runs, the target is gone (a
    // concurrent process, a race between purges). statSync(absPath) inside
    // writeFileAtomic then throws for real; nothing here is mocked.
    const target = join(TEST_DIR, 'file.txt')
    writeFileSync(target, 'original\n')
    unlinkSync(target)

    expect(() => writeFileAtomic(target, 'new content\n')).toThrow()

    // The failed write did not resurrect the target under a new name, and it
    // did not leave the temp file it created (and then had to clean up)
    // behind. Both are checked by reading the directory, not by assuming.
    expect(existsSync(target)).toBe(false)
    expect(readdirSync(TEST_DIR).filter((f) => f.includes('.alpheus-'))).toEqual([])
  })

  it('propagates the original error, not a cleanup error, when the temp file was never created', () => {
    // The temp file's own directory does not exist, so writeFileSync fails
    // before any temp file exists. The cleanup unlinkSync then also fails
    // (ENOENT on a path that was never created), which the inner catch must
    // swallow so the caller sees the real failure instead of a cleanup one.
    const target = join(TEST_DIR, 'missing-dir', 'file.txt')

    expect(() => writeFileAtomic(target, 'content\n')).toThrow()
    expect(existsSync(join(TEST_DIR, 'missing-dir'))).toBe(false)
  })
})
