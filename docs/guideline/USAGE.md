# Using branchdiff

`branchdiff` is a CLI that opens a browser UI for reviewing git branch, commit, and working-tree diffs — **locally, no cloud, no telemetry**.

Think of it as a beefed-up `git diff`:
- **file-level comparison** (actual content, ignores commit-path noise)
- side-by-side and unified views with syntax highlighting
- inline comments + GitHub PR push/pull
- full-file view popup (Bitbucket-style) for any changed file

For contributor setup (cloning, linking a local build, releasing) see [DEVELOPMENT.md](./DEVELOPMENT.md).

---

## Requirements

- **Node.js ≥ 20** — React Router 7 (the UI) needs it
- **git** available on `PATH`
- **gh CLI** — optional, only for the `branchdiff <pr-url>` shortcut ([install](https://cli.github.com))

---

## Install

### Try once without installing

```bash
npx @encryptioner/branchdiff main..feature
```

npm downloads and runs it in a temp dir.

### Global install (recommended)

```bash
# npm
npm install -g @encryptioner/branchdiff

# pnpm
pnpm add -g @encryptioner/branchdiff

# yarn
yarn global add @encryptioner/branchdiff
```

Then the `branchdiff` binary is on your `PATH`:

```bash
branchdiff --version
```

### Per-project dev dependency

```bash
pnpm add -D @encryptioner/branchdiff
```

Add a script to `package.json`:

```json
{
  "scripts": {
    "diff": "branchdiff"
  }
}
```

Run it with `pnpm run diff main..feature`.

---

## First run

From inside any git repository:

```bash
branchdiff
```

Opens `http://localhost:5391/diff?...` in your default browser showing current uncommitted changes. `Ctrl+C` stops the server.

---

## Common workflows

### Uncommitted changes

```bash
branchdiff                    # unstaged + staged
branchdiff staged             # only staged
branchdiff unstaged           # only unstaged
```

### Recent commits

```bash
branchdiff HEAD~1             # last commit
branchdiff HEAD~5             # last 5 commits
```

### Compare branches (or any refs)

```bash
branchdiff main                       # current branch vs main
branchdiff main..feature              # range syntax
branchdiff --base main --compare feat # flag syntax
branchdiff main feature               # two positional args
branchdiff v1.0.0 v2.0.0              # tags
branchdiff 1df74cc 3b9a54d            # commit SHAs
branchdiff HEAD~3 HEAD                # relative refs
branchdiff origin/main feature        # remote + local
```

**Any ref `git rev-parse --verify` accepts works**: branches, commits, tags, `HEAD`, `HEAD~N`, `origin/<branch>`.

### Branch comparison modes

```bash
branchdiff main feature --mode file   # (default) compare blob hashes
branchdiff main feature --mode git    # standard git diff (commit-level)
```

**When to use which:**
- `file` — you want *what is different right now*, regardless of how the branches got there. Best for PR review.
- `git` — you want the commit-level diff, including history noise. Best for understanding how a feature evolved.

Example: if `main` and `feature` both added the same comment via different commits, `--mode file` reports no change, `--mode git` reports a modification.

### Delta mode (Δ) — browser UI only

When comparing two branches, click the **Δ** toggle in the toolbar to see what file mode and git mode each report differently, side by side:

| Category | Color | Meaning |
|---|---|---|
| Git-only | Amber | File appears in git diff but not file diff — usually commit-path noise |
| File-only | Blue | File appears in file diff but not git diff — investigate further |
| Shared | Neutral | Both modes agree this file changed |

Click any git-only or file-only file row to expand a preview of the actual changed lines. This lets you quickly identify history noise without manually switching between modes.

### Review a GitHub PR by URL

```bash
branchdiff https://github.com/owner/repo/pull/123
```

Requires the [`gh` CLI](https://cli.github.com) installed and authenticated (`gh auth login`). Checks out the PR branch and diffs against its base.

### UI options

```bash
branchdiff --dark             # dark theme
branchdiff --unified          # unified view (default is split)
branchdiff --no-open          # don't auto-open the browser
branchdiff --quiet            # minimal terminal output
branchdiff --port 7000        # specific port (default auto-assigns from 5391)
```

### File browser

```bash
branchdiff tree               # browse the repo's files in the UI
```

---

## AI-assisted review (any agent)

branchdiff exposes structured data (`--json` on every `agent` command; `/api/threads/export`) so **any AI assistant** — Claude Code, Cursor, Codex, Copilot, Gemini CLI — can review your diff, post comments, and apply fixes. No plugin, no skills install.

Typical loop:

```
you:  "Review the changes." (to your AI)
AI:   runs `branchdiff agent diff` → posts comments via `branchdiff agent comment`
you:  add your own comments too, in the UI or via `branchdiff agent comment`
you:  "Fix every open [must-fix] comment." (to your AI)
AI:   runs `branchdiff agent list --status open --json`, applies fixes,
      marks each resolved with `branchdiff agent resolve <id> --summary "..."`
```

The four primitives agents use:

| Command | Purpose |
|---|---|
| `branchdiff agent diff` | Stream the unified diff |
| `branchdiff agent list [--status open] --json` | Read all threads |
| `branchdiff agent comment --file <p> --line <n> --body "[must-fix] …"` | Post a comment |
| `branchdiff agent resolve <id> --summary "…"` | Mark a thread fixed |

Severity tags: `[must-fix]`, `[suggestion]`, `[nit]`, `[question]` — placed at the start of the comment body.

**Full prompt templates + examples:** [AI-REVIEW.md](./AI-REVIEW.md)

---

## CLI flag reference

| Flag | Default | Description |
|---|---|---|
| `--mode <file\|git>` | `file` | Diff mode: file (blob hashes) or git (commit ancestry) |
| `--base <ref>` | — | Base ref to compare from |
| `--compare <ref>` | — | Ref to compare against |
| `--port <port>` | auto 5391+ | HTTP server port |
| `--no-open` | — | Don't auto-open browser |
| `--dark` | — | Open UI in dark mode |
| `--unified` | — | Open UI in unified view |
| `--quiet` | — | Minimal terminal output |
| `--new` | — | Force restart of this repo's instance |

---

## Multi-instance support

Run `branchdiff` in multiple repos at the same time. Ports auto-assign from `5391`:

| Instance | Repo | Port |
|---|---|---|
| 1 | `project-a` | 5391 |
| 2 | `project-b` | 5392 |
| 3 | `project-c` | 5393 |

Registry lives at `~/.branchdiff/registry.json` and is cleaned up automatically when instances exit. Force a specific port with `--port 7000`.

If you re-run `branchdiff` in a repo that already has an instance, it **reuses** that instance and reopens the browser — it does not start a second server. Use `--new` to force a restart.

---

## Instance management

```bash
branchdiff list               # list all running instances
branchdiff kill               # stop all instances
branchdiff open               # reopen the last instance for this repo
branchdiff prune              # wipe all branchdiff data (~/.branchdiff)
branchdiff doctor             # diagnose install / env issues
branchdiff update             # self-update via npm
```

---

## Data & privacy

Everything runs **locally**. No telemetry, no outbound network calls — except:
- `localhost` (the UI talks to the CLI's HTTP server)
- GitHub API via your local `gh` CLI (only if you use the PR URL flow or push/pull comments)

State is stored in:
- `~/.branchdiff/registry.json` — running instance metadata
- `~/.branchdiff/<repo-hash>/` — per-repo SQLite db with review comments and threads

Wipe everything with `branchdiff prune`.

---

## Troubleshooting

### "Error: Not a git repository"
Run `branchdiff` from inside a git working tree.

### Port 5391 already in use (by something else)
```bash
branchdiff --port 7000
```
`branchdiff list` only tracks its own instances.

### UI won't load / stale cache
```bash
branchdiff --new
```
Forces a clean restart of this repo's instance.

### Native module errors (`better-sqlite3`)
Happens when you installed on one Node version and switched to another.
```bash
npm rebuild -g better-sqlite3
# or
pnpm rebuild -g
```

### "GitHub CLI (gh) is not installed"
Install from <https://cli.github.com> then `gh auth login`. Required only for the PR URL workflow.

### Something weird — run the doctor
```bash
branchdiff doctor
```

---

## Uninstall

```bash
npm uninstall -g branchdiff
# or: pnpm remove -g branchdiff

branchdiff prune       # clean state
rm -rf ~/.branchdiff   # nuclear option
```

---

## See also

- [DEVELOPMENT.md](./DEVELOPMENT.md) — cloning, local linking, releasing
- [../OVERVIEW.md](../OVERVIEW.md) — architecture
- [GitHub issues](https://github.com/Encryptioner/branchdiff/issues) — bug reports, feature requests
- [npm](https://www.npmjs.com/package/@encryptioner/branchdiff)
