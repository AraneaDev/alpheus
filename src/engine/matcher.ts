import type { DiffHunk, MiasmaItem } from '../scanner/types.ts'
import { scanGitDiff, scanUntrackedFiles } from '../scanner/git.ts'
import { detectLanguage } from './language.ts'
import { makeFindingId } from './identity.ts'
import { RULES } from './rules/registry.ts'
import type { MatchContext, Rule, RuleMatch } from './rules/types.ts'

/** The single registry entry that judges untracked file paths. */
const SCRATCH_RULE = RULES.find((rule) => rule.category === 'SCRATCH')

/**
 * Turns a rule's match into a finding, pulling the span's exact text out of the hunk.
 *
 * @param rule - The rule that fired.
 * @param match - The range it objected to.
 * @param filePath - Repository-relative path to the file.
 * @param byLineNumber - The hunk's added lines, keyed by line number.
 * @returns The finding.
 */
function toItem(
  rule: Rule,
  match: RuleMatch,
  filePath: string,
  byLineNumber: Map<number, string>,
): MiasmaItem {
  const lines: string[] = []

  for (let l = match.startLine; l <= match.endLine; l++) {
    const content = byLineNumber.get(l)
    if (content !== undefined) lines.push(content)
  }

  return {
    id: makeFindingId(rule.category, filePath, match.startLine, lines),
    filePath,
    category: rule.category,
    ruleId: rule.id,
    span: { startLine: match.startLine, endLine: match.endLine, lines },
    explanation: match.explanation,
    confidence: match.confidence,
  }
}

/**
 * Evaluates diff hunks and extracts line-level and block-level miasma items.
 *
 * @param hunks - Parsed unified diff hunks.
 * @returns Array of detected miasma findings.
 */
export function evaluateHunks(hunks: DiffHunk[]): MiasmaItem[] {
  const items: MiasmaItem[] = []

  for (const hunk of hunks) {
    const lang = detectLanguage(hunk.filePath)
    const ctx: MatchContext = { filePath: hunk.filePath, lang, lines: hunk.lines }
    const byLineNumber = new Map(hunk.lines.map((l) => [l.lineNumber, l.content]))

    // SCRATCH rules judge a whole untracked file path, not a diff hunk; they
    // run only from `evaluateUntracked`, so a hunk never applies them.
    const applicable = RULES.filter(
      (rule) =>
        rule.category !== 'SCRATCH' &&
        (rule.languages === 'any' || rule.languages.includes(lang)),
    )

    // Block rules run first so their lines can be withheld from line rules: a
    // commented-out console.log inside a dead block is one finding, not two.
    const blockRules = applicable.filter((r) => r.category === 'TOMBSTONE')
    const lineRules = applicable.filter((r) => r.category !== 'TOMBSTONE')
    const covered = new Set<number>()

    for (const rule of blockRules) {
      for (const match of rule.match(ctx)) {
        for (let l = match.startLine; l <= match.endLine; l++) covered.add(l)
        items.push(toItem(rule, match, hunk.filePath, byLineNumber))
      }
    }

    const visible = { ...ctx, lines: hunk.lines.filter((l) => !covered.has(l.lineNumber)) }

    for (const rule of lineRules) {
      for (const match of rule.match(visible)) {
        items.push(toItem(rule, match, hunk.filePath, byLineNumber))
      }
    }
  }

  return items
}

/**
 * Evaluates untracked files against throwaway/scratch heuristics.
 *
 * Goes through the SCRATCH registry entry rather than duplicating its
 * heuristic, so the rule's own confidence split (an explicit `.tmp`/`.bak`
 * extension scores higher than a merely generic name) is what actually runs,
 * instead of a second, hardcoded score living here.
 *
 * @param untrackedFiles - Relative paths of untracked files.
 * @returns Array of scratch file miasma findings.
 */
export function evaluateUntracked(untrackedFiles: string[]): MiasmaItem[] {
  const items: MiasmaItem[] = []
  if (!SCRATCH_RULE) return items

  for (const file of untrackedFiles) {
    const ctx: MatchContext = { filePath: file, lang: detectLanguage(file), lines: [] }

    for (const match of SCRATCH_RULE.match(ctx)) {
      items.push({
        id: makeFindingId('SCRATCH', file, 0, [file]),
        filePath: file,
        category: 'SCRATCH',
        ruleId: SCRATCH_RULE.id,
        explanation: match.explanation,
        confidence: match.confidence,
      })
    }
  }

  return items
}

/**
 * Evaluates the full uncommitted git working tree (staged, unstaged, untracked).
 *
 * @param cwd - Working directory.
 * @returns Complete list of detected miasma findings.
 */
export async function evaluateWorkingTree(cwd: string): Promise<MiasmaItem[]> {
  const [hunks, untracked] = await Promise.all([
    scanGitDiff(cwd),
    scanUntrackedFiles(cwd),
  ])

  const hunkItems = evaluateHunks(hunks)
  const untrackedItems = evaluateUntracked(untracked)

  return [...hunkItems, ...untrackedItems]
}
