---
description: Scan the git working tree for agent debris, debug prints, silenced linters, and scratch files
allowed-tools: Bash(bun:*)
---

!`bun "$CLAUDE_PLUGIN_ROOT/src/cli.ts" check`

If any items were found above, present them clearly to the user and suggest running `alpheus` in their terminal to interactively review and purge them before committing.
