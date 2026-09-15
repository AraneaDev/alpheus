import type { MiasmaCategory } from '../../scanner/types.ts'
import type { SupportedLanguage } from '../language.ts'

/**
 * Everything a rule is given about one hunk of added lines.
 *
 * `lines` holds only the lines the diff added, in file order, so a line-level
 * rule iterates it and a block-level rule scans it for runs.
 */
export interface MatchContext {
  filePath: string
  lang: SupportedLanguage
  lines: { lineNumber: number; content: string }[]
}

/**
 * One range a rule objects to, with how sure it is.
 */
export interface RuleMatch {
  startLine: number
  endLine: number
  explanation: string
  confidence: number
}

/**
 * A named, addressable detector.
 *
 * The id is the handle a project uses to enable, disable or re-score a rule, so
 * it is part of the public contract and does not change once released.
 */
export interface Rule {
  id: string
  category: MiasmaCategory
  languages: SupportedLanguage[] | 'any'
  match(ctx: MatchContext): RuleMatch[]
}
