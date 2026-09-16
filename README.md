<div align="center">

# Alpheus

**A river through the stables.**
**It sweeps the agent's debris out of the working tree before you commit.**

[![Release](https://img.shields.io/github/v/release/AraneaDev/alpheus?label=release&include_prereleases)](https://github.com/AraneaDev/alpheus/releases)
[![Tool page](https://img.shields.io/badge/tool%20page-aranea--development.nl-0b7285)](https://aranea-development.nl/en/tools/alpheus)
[![Tests](https://img.shields.io/badge/tests-102%20passing-2b8a3e)](test/)
[![License](https://img.shields.io/github/license/AraneaDev/alpheus?label=license&color=yellow)](./LICENSE)
[![Language](https://img.shields.io/github/languages/top/AraneaDev/alpheus)](https://github.com/AraneaDev/alpheus)
[![Last commit](https://img.shields.io/github/last-commit/AraneaDev/alpheus?label=last%20commit)](https://github.com/AraneaDev/alpheus/commits/main)
[![Conventional Commits](https://img.shields.io/badge/commits-conventional-fe5196?logo=conventionalcommits&logoColor=white)](https://www.conventionalcommits.org/)
[![Status](https://img.shields.io/badge/status-pre--release-orange)](#install)

<img src="docs/images/tui.svg" alt="The Alpheus terminal interface: a list of findings on the left with selection boxes and class badges, and on the right a diff preview showing the line to be removed against the lines around it" width="840">

<sub>Painted by <code>scripts/generate-screenshots.ts</code> from a fixture rather than captured off a terminal, so it shows the layout and the colours rather than one particular run.</sub>

</div>

---

> **Alpheus** (Ἀλφειός) is the river god whose torrent Heracles diverted straight through the
> Augean stables, washing thirty years of accumulated dung out to sea in a single afternoon. Those
> stables were not filthy because anyone wanted them that way. Nobody had got round to it.

A Claude Code plugin and a CLI. It reads what the working tree has changed, names the parts that
were never meant to ship, and removes the ones you pick, with a backup you can undo.

A debug print added to trace a fault. A `// @ts-ignore` that made a type error go away. Four lines
of dead code left commented out in case they come back. A path into your own home directory. A
`temp.json` nobody deleted. A diff can tell you those lines were added. It cannot tell you which of
them you meant.

> **Status:** pre-release. The plugin installs from the Aranea marketplace and the CLI from this
> repository, see [Install](#install). It needs [Bun](https://bun.sh/) 1.1 or newer and git.

---

## Why it exists

Three things happen at commit time once an agent has been working alongside you.

An agent fixing one bug across eight files leaves a print in all eight to watch what runs. The bug
is fixed, the suite is green, `git commit -am "fix bug"` takes the lot, and the prints ship.

A strict TypeScript or ESLint rule gets a `// @ts-ignore` on the line above instead of a fix.
Nothing fails and nothing is flagged, and the type boundary the rule was guarding is quietly gone.

An absolute path to one machine is hardcoded into a config file, a test harness or a script. It
works where it was written and nowhere else, and the failure turns up in CI or on a colleague's
checkout.

Alpheus is the deterministic filter between all of that and your git history.

## What it finds

| Class | What it catches |
| :--- | :--- |
| `[LOG]` | Debug output added to watch execution: `console.log/debug/dir/time`, Python `print`, `breakpoint`, `pdb.set_trace`, `logging.debug`, Rust `dbg!` and `println!`, Go `fmt.Print*` and `log.Print*`, PHP `var_dump`, `print_r`, `dd`, shell `set -x` and `echo "DEBUG:..."` |
| `[SUPPRESS]` | A checker told to be quiet: `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `eslint-disable`, `biome-ignore`, `prettier-ignore`, `# noqa`, `# type: ignore`, `#[allow(...)]`, `//nolint`, `@phpstan-ignore`, `@psalm-suppress` |
| `[TOMBSTONE]` | Three or more consecutive commented-out lines that still read as code |
| `[PATH]` | A hardcoded home directory: `/home/<user>/`, `/Users/<user>/`, `C:\Users\<user>\` |
| `[SCRATCH]` | An untracked leftover: `*.tmp`, `*.scratch` and `*.bak` anywhere, plus `temp.*`, `scratch.*`, `dump.json`, `debug.log` and throwaway scripts like `t.py` at the repository root or under `scratch/` and `tmp/` |

Seven languages are recognised by extension: TypeScript, JavaScript, Python, Rust, Go, PHP and
shell. A file in anything else is still read for workstation paths and dead code, because neither
of those needs to know what language it is looking at.

What gets read is the additions in the staged and the unstaged diff, plus untracked files. Code
that was already in the file is left alone, so a `console.log` that has sat in the repository for a
year is not a finding.

Detection is deterministic: patterns per language, comment classification, and a language map keyed
on the file extension. No model, no tokens, no network request, and the same working tree answers
the same way twice.

## Commands

![The output of alpheus check: five findings grouped by class, each naming the file and line, quoting the source line and the reason it was flagged](docs/images/check.svg)

```text
alpheus                      Interactive review and purge
alpheus check [flags]        Non-interactive scan; exits 1 on anything confident enough to act on
alpheus clean [flags]        Purge what it is confident about, with a backup
alpheus restore [id]         Restore the working tree from a snapshot (default: the latest)
alpheus backups              List the snapshots there are
alpheus demo                 The interactive review, with made-up findings
alpheus help                 Usage and flags
```

`--json` prints machine-readable output and works for every command. `--quiet` belongs to `check`
and drops the table, leaving only the exit code. `--dry-run` belongs to `clean` and reports what
would have gone without removing it. `--min-confidence <0..1>` moves the bar described below, and
`--force` belongs to `restore`.

## How sure it has to be

Every finding carries a confidence. `clean` and the interactive review act at 0.8 and above, and
report everything below that as needing your eye instead of removing it. A `console.log` left in a
fix scores 0.95. A `@ts-expect-error` scores 0.4, because unlike `@ts-ignore` it fails the build
when it is no longer needed, so it is usually load-bearing. A `/home/runner/` path inside a CI
workflow scores 0.3, because that is how the build works rather than a path to one machine.

`--min-confidence 0` acts on everything, which is what `alpheus check` used to do before it learned
to tell these apart.

With no TTY, plain `alpheus` prints the same table `check` does and exits the same way, which is
what makes it usable from a script or a git hook.

## The interactive review

`alpheus` on its own opens a split pane: the findings on the left, the surrounding source on the
right with the line to be removed marked where it sits.

- `↑`/`↓` or `j`/`k` move through the list.
- `<space>` toggles one finding, `a` toggles all of them.
- `<enter>` purges what is selected, after writing a backup.
- `q` or `<esc>` leaves without touching a file.

## Safety and rollback

![The output of alpheus clean: four items purged across three files, one scratch file deleted by name, and the path of the backup it can be restored from](docs/images/clean.svg)

Before a line is removed or a scratch file unlinked, every affected file is copied into
`.alpheus/backups/<timestamp>_<id>/`, beside a `manifest.json` that records each file's sha256 as
it was, what was about to happen to it, and its sha256 once the purge had finished.

That last hash is what lets a restore tell an untouched file from one you have worked on since. If
a file changed after the purge, `alpheus restore` refuses and names every file it would have
overwritten, and nothing on disk is altered. `--force` restores anyway.

```bash
alpheus restore          # back to the state before the most recent purge
alpheus restore <id>     # back to one particular snapshot
alpheus backups          # what there is to go back to
```

`.alpheus/` is appended to `.git/info/exclude` rather than to your `.gitignore`. The snapshots stay
out of `git status` and out of any commit, and the repository you share with other people does not
grow a line about a tool only you run.

Edits are applied bottom-up by line number, so removing one line never moves the line the next
finding points at.

## In Claude Code

`/alpheus` runs the scan and hands the findings to the agent to present.

A `PreToolUse` hook watches Bash calls for a `git commit` and, when the working tree still holds
findings it is confident about, names the first five of them and blocks the commit. The findings
reach the model, so the agent can clean up after itself rather than committing over the top.

Findings below the confidence bar never block. Set `ALPHEUS_HOOK_MODE=warn` to have the hook report
without stopping the commit, or `ALPHEUS_HOOK_MODE=off` to disable it.

## Requirements

[Bun](https://bun.sh/) 1.1 or newer and git 2.25 or newer, and nothing else. Alpheus makes no
network request of any kind, has no API key and sends no telemetry.

## Install

```bash
claude plugin marketplace add https://aranea-development.nl/plugins/marketplace.json
claude plugin install alpheus@aranea
```

Hooks bind when a session starts, so start a new session after installing.

### If the install fails on port 22

Claude Code clones a plugin from its GitHub repository over SSH. On a machine with no SSH key for
GitHub, or with outbound port 22 blocked, the install stops here:

```text
Failed to clone repository: ssh: connect to host github.com port 22: Connection timed out
fatal: Could not read from remote repository.
Please make sure you have the correct access rights and the repository exists.
```

The message points at access rights. This repository is public, so what failed is the transport.
Adding the marketplace succeeds either way, because that clone uses HTTPS.

Tell git to reach GitHub over HTTPS, then install again:

```bash
git config --global --add url."https://github.com/".insteadOf "git@github.com:"
git config --global --add url."https://github.com/".insteadOf "ssh://git@github.com/"
```

That rewrites outgoing GitHub SSH URLs and nothing else, so it takes nothing away on a machine that
could not use them in the first place. To undo it:

```bash
git config --global --unset-all url."https://github.com/".insteadOf
```

### The CLI on its own

Alpheus is not on npm. The CLI installs from this repository, with or without Claude Code:

<!-- x-release-please-start-version -->
```bash
bun install -g github:AraneaDev/alpheus#v0.1.5
```
<!-- x-release-please-end -->

Every released version is listed on the
[releases page](https://github.com/AraneaDev/alpheus/releases).

## What Alpheus does not do

It does not judge. `println!` in Rust is how a program writes its output as well as how somebody
traces a fault, and Alpheus flags both. So does a `print` in a Python script whose whole job is to
print. That is what the review pane is for: the tool finds candidates, and which of them are debris
is yours to say.

It reads additions and untracked files, and nothing else. Code that was already in the file is
never a finding and is never modified.

It never commits and never stages. It cleans a working tree and stops there.

It calls no model, spends no tokens, makes no network request and sends nothing anywhere.

## Development

```bash
git clone https://github.com/AraneaDev/alpheus.git
cd alpheus
bun install
bun link             # puts the local checkout on your PATH as `alpheus`
bun run check        # lint, markdownlint, typecheck, knip, and the suite with coverage at 90%
bun run screenshots  # repaints the SVGs in docs/images/
```

## License

MIT.

---

Built by [Tim Schipper](https://tim-schipper.nl/en) and released as open source under
[Aranea Development](https://aranea-development.nl).
