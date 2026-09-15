import type { Rule } from './types.ts'
import { logRules } from './log.ts'
import { suppressRules } from './suppress.ts'
import { pathRules } from './path.ts'
import { tombstoneRules } from './tombstone.ts'
import { scratchRules } from './scratch.ts'

/**
 * Every rule Alpheus knows about.
 *
 * Rules are addressed by id so that a project can enable, disable or re-score
 * them individually. Adding a rule means adding an entry here and nothing else.
 */
export const RULES: Rule[] = [
  ...logRules,
  ...suppressRules,
  ...pathRules,
  ...tombstoneRules,
  ...scratchRules,
]
