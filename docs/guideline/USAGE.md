# Using branchdiff

`@encryptioner/branchdiff` is a CLI that opens a browser UI for reviewing
branch/PR diffs locally. This guide covers installing and using the published
npm package.

For contributor setup (cloning, linking a local build, publishing releases)
see [DEVELOPMENT.md](./DEVELOPMENT.md).

---

## Requirements

- **Node.js ≥ 20** — React Router 7 (the UI) needs it
- **git** on `PATH`
- **pnpm ≥ 8** *(optional — only if you use pnpm to install)*
- **gh CLI** *(optional — only for the `branchdiff <pr-url>` flow)*

---

## Install

### One-shot (no install)

```bash
npx @encryptioner/branchdiff main..feature
```

Use this when you want to try it once. npm downloads and runs it in a temp dir.

### Global install

```bash
# npm
npm install -g @encryptioner/branchdiff

# pnpm
pnpm add -g @encryptioner/branchdiff

# yarn
yarn global add @encryptioner/branchdiff
```

After install the `branchdiff` binary is on your `PATH`:

```bash
branchdiff --version
```

### Per-project dev dependency

```bash
pnpm add -D @encryptioner/branchdiff
```

Then add a script to your `package.json`:

```json
{
  "scripts": {
    "diff": "branchdiff"
  }
}
```

And run it via `pnpm run diff main..feature`.

---

## First run

From inside any git repository:

```bash
branchdiff
```

This opens `http://localhost:5391/diff?...` in your default browser with the
current uncommitted changes. Press `Ctrl+C` in the terminal to stop.

---

## Common workflows

### See uncommitted changes

```bash
branchdiff                    # unstaged + staged
branchdiff staged             # only staged
branchdiff unstaged           # only unstaged
```

### Review your recent commits

```bash
branchdiff HEAD~1             # last commit
branchdiff HEAD~5             # last 5 commits
```

### Compare branches

```bash
branchdiff main                       # current branch vs main (file-level)
branchdiff main..feature              # range syntax
branchdiff --base main --compare feat # flag syntax (equivalent)
branchdiff main feature               # two-arg form
branchdiff v1.0.0 v2.0.0              # compare tags
```

### Branch comparison modes

```bash
branchdiff main feature --mode file   # default — compare blob hashes (fast, ignores history noise)
branchdiff main feature --mode git    # standard git diff (commit-level)
```

**When to use `file` vs `git`:**
- `file` — you want to see *what is different right now*, regardless of how
  the branches got there. Good for PR review and branch comparison.
- `git` — you want the commit-level diff, including the history of changes.
  Good for understanding the evolution of a feature.

### Review a GitHub PR

```bash
branchdiff https://github.com/owner/repo/pull/123
```

Requires `gh` CLI installed and authenticated (`gh auth login`). This checks
out the PR branch and opens the diff against the PR's base.

### UI options

```bash
branchdiff --dark             # dark mode
branchdiff --unified          # unified view (default is split)
branchdiff --no-open          # don't auto-open the browser
branchdiff --quiet            # minimal terminal output
```

### Tree browser

```bash
branchdiff tree               # browse the repo's files in the UI
```

---

## Multi-instance support

You can run `branchdiff` in several repos at the same time. Ports are
auto-assigned from `5391` upward:

| Instance | Repo                 | Port |
|----------|----------------------|------|
| 1        | `project-a`          | 5391 |
| 2        | `project-b`          | 5392 |
| 3        | `project-c`          | 5393 |

The registry lives at `~/.branchdiff/registry.json` and is cleaned up
automatically when instances exit. Force a specific port with `--port 7000`.

If you re-run `branchdiff` in a repo that already has an instance, it
**reuses** that instance and reopens the browser — it does not start a second
server. Use `--new` to force a restart.

---

## Instance management commands

```bash
branchdiff list               # list all running instances
branchdiff kill               # stop all instances
branchdiff open               # reopen the last instance for this repo
branchdiff prune              # remove all branchdiff data (~/.branchdiff)
branchdiff doctor             # diagnose install / environment issues
```

---

## Data & privacy

Everything runs **locally**. No telemetry, no network calls (other than to
`localhost` and, if you use the PR URL flow, to GitHub via your `gh` CLI).

State is stored in:

- `~/.branchdiff/registry.json` — running instance metadata
- `~/.branchdiff/<repo-hash>/` — per-repo SQLite db for review comments and
  threads

Run `branchdiff prune` to wipe everything.

---

## Troubleshooting

### "Error: Not a git repository"

Run `branchdiff` from inside a git working tree.

### Port 5391 already in use (non-branchdiff process)

```bash
branchdiff --port 7000
```

Or kill whatever is using 5391. `branchdiff list` only tracks its own
instances.

### UI won't load / stale cache

```bash
branchdiff --new
```

Forces a clean restart of this repo's instance.

### Native module errors (`better-sqlite3`)

This almost always means you installed on one Node version and switched to
another. Reinstall:

```bash
npm rebuild better-sqlite3
# or
pnpm rebuild
```

### "GitHub CLI (gh) is not installed"

Install from <https://cli.github.com> then `gh auth login`. Required only for
the PR URL workflow.

---

## Uninstall

```bash
# npm
npm uninstall -g @encryptioner/branchdiff

# pnpm
pnpm remove -g @encryptioner/branchdiff

# clean up local state
branchdiff prune
rm -rf ~/.branchdiff
```

---

## See also

- [DEVELOPMENT.md](./DEVELOPMENT.md) — cloning, local linking, releasing
- [../OVERVIEW.md](../OVERVIEW.md) — architecture
- [GitHub issues](https://github.com/Encryptioner/branchdiff/issues)
