import { describe, expect, it } from 'bun:test'
import { parseUnifiedDiff } from '../src/scanner/git.ts'

describe('Git Scanner — parseUnifiedDiff', () => {
  it('should parse added lines from a single file unified diff', () => {
    const rawDiff = `diff --git a/src/auth.ts b/src/auth.ts
index 1234567..89abcdef 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -40,0 +41,2 @@
+console.log("debugging token", token);
+const x = 1;
`
    const hunks = parseUnifiedDiff(rawDiff)
    expect(hunks.length).toBe(1)
    expect(hunks[0].filePath).toBe('src/auth.ts')
    expect(hunks[0].startLine).toBe(41)
    expect(hunks[0].lineCount).toBe(2)
    expect(hunks[0].lines).toEqual([
      { lineNumber: 41, content: 'console.log("debugging token", token);', type: 'add' },
      { lineNumber: 42, content: 'const x = 1;', type: 'add' },
    ])
  })

  it('should handle single-line additions where count is omitted', () => {
    const rawDiff = `diff --git a/src/utils.ts b/src/utils.ts
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -10 +10 @@
-const a = 1;
+const a = 2;
`
    const hunks = parseUnifiedDiff(rawDiff)
    expect(hunks.length).toBe(1)
    expect(hunks[0].filePath).toBe('src/utils.ts')
    expect(hunks[0].startLine).toBe(10)
    expect(hunks[0].lines.length).toBe(1)
    expect(hunks[0].lines[0]).toEqual({
      lineNumber: 10,
      content: 'const a = 2;',
      type: 'add',
    })
  })

  it('should parse multi-file diffs correctly', () => {
    const rawDiff = `diff --git a/src/one.ts b/src/one.ts
--- a/src/one.ts
+++ b/src/one.ts
@@ -5,0 +6,1 @@
+console.log("one");
diff --git a/src/two.py b/src/two.py
--- a/src/two.py
+++ b/src/two.py
@@ -1,0 +1,2 @@
+print("two")
+# noqa
`
    const hunks = parseUnifiedDiff(rawDiff)
    expect(hunks.length).toBe(2)
    expect(hunks[0].filePath).toBe('src/one.ts')
    expect(hunks[0].lines[0].lineNumber).toBe(6)
    expect(hunks[1].filePath).toBe('src/two.py')
    expect(hunks[1].lines.length).toBe(2)
    expect(hunks[1].lines[0].lineNumber).toBe(1)
    expect(hunks[1].lines[1].lineNumber).toBe(2)
  })

  it('should return an empty array for empty diff output', () => {
    expect(parseUnifiedDiff('')).toEqual([])
    expect(parseUnifiedDiff('   \n  \n')).toEqual([])
  })
})
