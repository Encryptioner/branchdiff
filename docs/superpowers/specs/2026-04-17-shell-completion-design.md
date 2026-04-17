# Shell Tab Completion for branchdiff

**Date**: 2026-04-17
**Status**: Implemented

## Problem

Users must type full branch names when running `branchdiff main feature/some-long-branch-name`. Git provides tab-completion for branches; branchdiff should do the same.

## Solution

Completion files are dropped into standard shell auto-discovery directories. No `eval`, no shell config editing — works out of the box after install.

## UX

```bash
# After install, works automatically (restart terminal once)
branchdiff ma<Tab>          → branchdiff main
branchdiff dev/<Tab>        → shows branches matching dev/*
branchdiff --base fe<Tab>   → branchdiff --base feature/login
branchdiff --mode <Tab>     → shows file, git
branchdiff <Tab>            → shows all branches + subcommands
```

## Scope

- **Shells**: zsh, bash
- **Completable items**:
  - Positional args (`[refs...]`): local + remote branches
  - `--base <ref>` / `--compare <ref>`: same branch list
  - `--mode <value>`: `file`, `git`
  - Subcommands: `tree`, `list`, `kill`, `prune`, `update`, `doctor`, `open`, `completion`
- **Branch source**: `git branch -a` called directly by completion script (no dependency on branchdiff CLI)
- **Special refs**: include `staged`, `unstaged`, `HEAD`, `.` alongside branches

## Commands

### `branchdiff completion install`

Writes completion file to the standard shell auto-discovery directory:

- **zsh**: `~/.zfunc/_branchdiff` (zsh auto-loads `#compdef` files from `fpath`)
- **bash**: `~/.local/share/bash-completion/completions/branchdiff` (bash-completion auto-scans this dir)

Detects current shell from `$SHELL`. Ensures `fpath+=~/.zfunc` is in `.zshrc`. Cleans up old `eval`-style lines if present. Idempotent — safe to run multiple times.

### `branchdiff completion zsh` / `bash`

Prints the completion script to stdout. Useful for manual inspection or custom setups.

### postinstall hook

After `npm install -g branchdiff`, the `postinstall` script runs `node dist/index.js completion install 2>/dev/null` silently. Failures are ignored so install never breaks.

## Implementation Details

### New files

- `packages/cli/src/completions/zsh.sh` — zsh completion script (inlined by esbuild)
- `packages/cli/src/completions/bash.sh` — bash completion script (inlined by esbuild)
- `packages/cli/src/commands/completion.ts` — completion command, installs scripts to disk

### Modified files

- `packages/cli/src/index.ts` — registers completion command
- `packages/cli/build.ts` — added `loader: { '.sh': 'text' }` for esbuild inlining
- `packages/cli/package.json` — postinstall runs `node dist/index.js completion install`

### Why file-drop instead of eval

| Approach | Pros | Cons |
|----------|------|------|
| `eval "$(branchdiff completion zsh)"` | Dynamic | Requires branchdiff in PATH at shell startup; silently fails on first install; modifies shell config |
| **File-drop to `~/.zfunc/`** | Zero config; shells auto-discover; no PATH dependency; idempotent | One-time `fpath` setup in `.zshrc` (handled by install command) |

The completion scripts call `git branch -a` directly (not branchdiff) — this removes the runtime dependency on the branchdiff binary being available during completion.

### Error handling

- If not in a git repo, `git branch` returns empty (silent, no error in completion)
- `completion install` failures are non-fatal (postinstall must never block install)
- Idempotent: running install twice is safe (no duplicates)

## Out of Scope

- Fish shell support (can be added later)
- Tag completion (can be added to branch list in `.sh` files later)
- Custom completion caching (unnecessary — git branch is fast)

## Change Log

| Date | Change |
|------|--------|
| 2026-04-17 | Initial spec (eval approach) |
| 2026-04-17 | Revised: switched to file-drop approach for zero-config install |
