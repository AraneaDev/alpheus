<div align="center">

# Alpheus

**A river through the stables.**  
**Sweeping the agent's debris before you commit.**

[![License](https://img.shields.io/github/license/AraneaDev/alpheus?label=license&color=yellow)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-43%20passing-2b8a3e)](#development)
[![Conventional Commits](https://img.shields.io/badge/commits-conventional-fe5196?logo=conventionalcommits&logoColor=white)](https://www.conventionalcommits.org/)
[![Status](https://img.shields.io/badge/status-pre--release-orange)](#quick-start)

</div>

---

> **Alpheus** (Ἀλφειός) is the river god whose torrent Heracles diverted straight
> through the Augean stables, washing thirty years of accumulated dung into the sea
> in a single afternoon. This tool diverts an automated river through your working
> tree: sweeping away the debug prints, silenced linters, scratch files, and
> commented dead code that agents leave behind before you commit.

Autonomous coding agents are great at reaching a passing test. They are also notoriously
careless about cleaning up after themselves. After fixing a bug, agents routinely leave
behind ephemeral `console.log` statements, disabled linter directives (`// eslint-disable`,
`# noqa`) added to silence the compiler, untracked scratch files (`scratch.py`, `temp.json`),
commented-out dead code blocks, and hardcoded absolute paths.

**Alpheus** detects, reviews, and purges this scaffolding before you commit. It offers an
interactive split-pane terminal UI (TUI) for manual curation, headless commands (`alpheus check`)
for pre-commit hooks and CI pipelines, and a non-destructive snapshot safety layer with
instant rollback (`alpheus restore`).

---

## What It Catches (The Core 5)

Alpheus inspects only **newly added lines** in uncommitted working tree diffs and **untracked files**. Pre-existing code outside the diff is never touched.

1. **`[LOG]` Ephemeral Debug Prints:**
   * TypeScript / JavaScript: `console.log`, `console.debug`, `console.dir`, `console.time`
   * Python: `print()`, `breakpoint()`, `pdb.set_trace()`, `logging.debug()`
   * Rust: `dbg!()`, `println!()`, `eprintln!()`
   * Go: `fmt.Println()`, `fmt.Printf()`, `log.Println()`
   * PHP: `var_dump()`, `print_r()`, `dump()`, `dd()`
   * Shell: `set -x`, `echo "DEBUG: ..."`
2. **`[SUPPRESS]` Added Linter Silencers:**
   * `// eslint-disable`, `// @ts-ignore`, `// @ts-expect-error`, `// biome-ignore`
   * `# noqa`, `# type: ignore`
   * `#[allow(unused_...)]`, `#[allow(clippy::...)]`
   * `//nolint`
   * `// @phpstan-ignore`
3. **`[SCRATCH]` Untracked Temporary Artifacts:**
   * `scratch.*`, `temp.*`, `tmp.*`, `*.tmp`
   * Diagnostic dumps in workspace root: `dump.json`, `debug.log`, `out.log`, `test.json`
   * Throwaway root test scripts: `t.py`, `test.js`, `test.ts`, `foo.py`
4. **`[TOMBSTONE]` Commented-Out Dead Code:**
   * Contiguous blocks of $\ge 3$ commented lines containing structural code syntax (`const`, `return`, `def`, `{`, `;`).
5. **`[PATH]` Hardcoded Workstation Paths:**
   * Local home directories: `/home/<user>/...`, `/Users/<user>/...`, `C:\Users\<user>\...`

---

## Quick Start

### 1. Interactive TUI
Run Alpheus without arguments in your repository terminal:

```bash
alpheus
```

* `<↑/↓>` or `<j/k>`: Navigate through findings
* `<Space>`: Toggle selection checkbox (`[x]` / `[ ]`)
* `<a>`: Toggle all findings in active category
* `<Enter>`: Purge selected items in-place (captures safety backup first)
* `<q>` / `<Esc>`: Cancel and exit without modifying files

### 2. Pre-Commit / CI Check
To run as a non-interactive gate that exits with code `1` if miasma is detected:

```bash
alpheus check
```

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/sh
alpheus check --quiet || (echo "Alpheus: Agent miasma found. Run 'alpheus' to clean." && exit 1)
```

### 3. Batch Cleanup
To purge all detected items without opening the TUI:

```bash
alpheus clean --all
```

Supports `--dry-run` to preview actions without touching files.

### 4. Safety & Rollback
Alpheus takes an atomic snapshot in `.alpheus/backups/` before any line deletion or file removal. To revert:

```bash
alpheus restore          # Reverts to the state prior to the most recent purge
alpheus restore <id>     # Restores from a specific snapshot ID
alpheus backups          # Lists all available historical backups
```

---

## Claude Code Plugin

Alpheus installs as a Claude Code plugin with native slash commands and pre-commit advisories:

```bash
/plugin install alpheus@aranea
```

* **Slash Command `/alpheus`:** Runs an in-session working tree scan and outputs a structured finding table.
* **Pre-Tool Hook:** When Claude runs a bash `git commit` command, Alpheus intercepts and prints an advisory if uncommitted debug prints or scratch files are detected.

---

## Development & Verification

Alpheus requires [Bun](https://bun.sh/) 1.1 or newer:

```bash
bun install
bun test              # Run unit, scanner, mutator, and TUI tests
bun run typecheck     # Verify TypeScript types
bun run lint          # Check code style with ESLint
```

---

## License

MIT © AraneaDev
