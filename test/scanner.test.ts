import { describe, expect, it } from 'bun:test'
import { parseUnifiedDiff } from '../src/scanner/git.ts'

describe('Git Scanner — parseUnifiedDiff', () => {
  it('should parse added lines from a single file unified diff with standard a/b prefixes', () => {
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

  it('should parse diffs generated with mnemonic prefixes (i/ and w/)', () => {
    const rawDiff = `diff --git i/src/cli.ts w/src/cli.ts
index 4754c3f..6e442e8 100644
--- i/src/cli.ts
+++ w/src/cli.ts
@@ -134,0 +135 @@
+console.log("agent test");
`
    const hunks = parseUnifiedDiff(rawDiff)
    expect(hunks.length).toBe(1)
    expect(hunks[0].filePath).toBe('src/cli.ts')
    expect(hunks[0].startLine).toBe(135)
    expect(hunks[0].lines[0].content).toBe('console.log("agent test");')
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

  it('should ignore deleted files with +++ /dev/null', () => {
    const rawDiff = `diff --git a/old.txt b/old.txt
deleted file mode 100644
--- a/old.txt
+++ /dev/null
@@ -1,1 +0,0 @@
-goodbye
`
    const hunks = parseUnifiedDiff(rawDiff)
    expect(hunks).toEqual([])
  })

  it('should extract filename from diff --git line when +++ is missing', () => {
    const rawDiff = `diff --git a/standalone.ts b/standalone.ts
@@ -0,0 +1,1 @@
+console.log("direct");
`
    const hunks = parseUnifiedDiff(rawDiff)
    expect(hunks.length).toBe(1)
    expect(hunks[0].filePath).toBe('standalone.ts')
    expect(hunks[0].lines[0].content).toBe('console.log("direct");')
  })

  it('should fallback to currentHunkLines.length when lineCount in hunk header is 0', () => {
    const rawDiff = `diff --git a/test.ts b/test.ts
--- a/test.ts
+++ b/test.ts
@@ -1,0 +1,0 @@
+console.log("added despite 0 count");
`
    const hunks = parseUnifiedDiff(rawDiff)
    expect(hunks.length).toBe(1)
    expect(hunks[0].lineCount).toBe(1)
  })

  it('should return an empty array for empty diff output', () => {
    expect(parseUnifiedDiff('')).toEqual([])
    expect(parseUnifiedDiff('   \n  \n')).toEqual([])
  })
})
