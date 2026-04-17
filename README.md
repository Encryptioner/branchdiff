# branchdiff

**Visual file-level git branch diff in your browser.**

[![npm](https://img.shields.io/npm/v/branchdiff.svg)](https://www.npmjs.com/package/branchdiff)
[![license](https://img.shields.io/npm/l/branchdiff.svg)](./LICENSE.md)

## Why branchdiff?

`git diff branch1..branch2` compares **commit ancestry**, not file content. If two branches reached the same state via different histories (rebase, cherry-pick, squash), git diff shows noise.

branchdiff compares **blob hashes at each branch tip** — identical content is silently skipped, regardless of history.

```
main:  A → B → C → D   (file.js = "hello world")
feat:  A → X → Y       (file.js = "hello world")

git diff main..feat  →  shows diff  (wrong: different commit paths)
branchdiff main feat →  no diff     (correct: same content)
```

## Install

```bash
npm install -g branchdiff
# or: pnpm add -g branchdiff
# or: yarn global add branchdiff
```

Also usable with `npx branchdiff main..feature` (no install).

**Requires Node.js 18+** and `git` on your `PATH`.

Shell tab-completion is installed automatically. After install, restart your terminal and `branchdiff ma<Tab>` will suggest branches.

## Usage

```bash
branchdiff                              # all uncommitted changes
branchdiff main                         # current branch vs main
branchdiff main feat                    # branch comparison (file-level)
branchdiff main feat --mode git         # commit-level diff
branchdiff main feat --mode file        # blob hash comparison (default)
branchdiff origin/stage/prod            # remote refs supported
branchdiff 1df74cc 3b9a54d              # any two commits (SHAs)
branchdiff HEAD~3 HEAD                  # relative refs
branchdiff v1.0.0 v1.1.0                # tags
branchdiff main feat --dark --unified   # dark mode, unified view
branchdiff tree                         # file browser
```

**Any ref `git rev-parse --verify` accepts works**: branches, commits, tags, `HEAD`, `HEAD~N`, `origin/<branch>`.

### CLI flags

| Flag | Description |
|---|---|
| `--mode <file\|git>` | Diff mode: file (blob hashes, default) or git (commit ancestry) |
| `--base <ref>` | Base ref to compare from |
| `--compare <ref>` | Ref to compare against |
| `--port <port>` | Port (default: auto-assigned from 5391) |
| `--no-open` | Don't auto-open browser |
| `--dark` | Open in dark mode |
| `--unified` | Open in unified view |
| `--quiet` | Minimal terminal output |
| `--new` | Force restart of this repo's instance |

### Shell completion

Tab-completion installs automatically. For manual setup:

```bash
branchdiff completion install   # auto-detect shell and install
branchdiff completion zsh       # print zsh completion script
branchdiff completion bash      # print bash completion script
```

Completes branch names (local + remote), subcommands, and `--mode` values.

**Full reference:** [docs/guideline/USAGE.md](./docs/guideline/USAGE.md)

## AI-assisted review

Any AI assistant (Claude Code, Cursor, Copilot, Gemini) can review code through the `branchdiff agent` CLI — no plugin or MCP server required.

```bash
# Start branchdiff first (leave it running)
branchdiff main feat

# Then in your agent chat:
branchdiff agent diff                                    # read the full diff
branchdiff agent comment --file src/app.ts --line 42 \
  --body "[must-fix] Missing null check"                # post a review comment
branchdiff agent list --status open --json               # check open threads
branchdiff agent resolve abc123de --summary "Fixed"      # mark thread resolved
```

**Severity tags:** `[must-fix]` `[suggestion]` `[nit]` `[question]` — put at start of comment body.

**Built-in workflows:** review, resolve, tour, summary, security audit, test gaps, dependency review, breaking-change detection. See [AI-REVIEW.md](./docs/guideline/AI-REVIEW.md) for prompt templates.

## Features

- **File-level diff** — compares blob hashes, skips identical content regardless of commit history
- **Git-level diff** — standard `git diff` when you want commit ancestry semantics
- **Full-file compare popup** — Bitbucket-style side-by-side full file view per changed file
- **Browser UI** — React SPA with split/unified views, syntax highlighting (Shiki, ~150 languages, lazy-loaded)
- **AI-ready review workflow** — any assistant (Claude Code, Cursor, Codex, Copilot, Gemini) can review, comment, and apply fixes via the `branchdiff agent …` CLI and `/api/threads/export`. No plugin required. [See AI guide →](./docs/guideline/AI-REVIEW.md)
- **Review comments** — with severity tags (`[must-fix]`, `[suggestion]`, `[nit]`, `[question]`)
- **GitHub PR integration** — push/pull review comments to a PR
- **Keyboard shortcuts** — `j`/`k` for file nav, `h`/`l` for hunk nav
- **File tree sidebar** — with status badges (A/M/D), search, resizable width
- **Multiple instances** — different repos on different ports, registry-tracked
- **Runs 100% locally** — no cloud, no telemetry

## Branch comparison modes

### File mode (default — blob hashes)

Compares **actual file content** at each branch tip, ignoring commit history.

- Use when: branches may have diverged via rebase/cherry-pick but reached the same state
- Shows files with different blob hashes only
- Best for: actual code-change review, regardless of commit path

```bash
branchdiff main feat
branchdiff main feat --mode file
```

### Git mode (standard `git diff`)

Uses **commit ancestry** comparison (`git diff branch1..branch2`).

- Use when: you care about the commit history between branches
- Best for: understanding how a feature evolved

```bash
branchdiff main feat --mode git
```

**Key difference:**
```
Scenario: both branches add the same comment to server.ts via different commits

File mode:  no change  (blob hashes identical)
Git mode:   modified    (commits differ, even though final state matches)
```

## How it works

```
git ls-tree -r <ref>     →  blob hash per file (fast equality check)
git show <ref>:<path>    →  file content at ref tip (no checkout needed)
diff(content_a, content_b) →  unified patch → rendered in browser
```

## Comparison with similar tools

| Tool | Browser | File-level diff | All files | Comments |
|---|---|---|---|---|
| `git diff` | No | No | Yes | No |
| `diff2html-cli` | Yes | No | Yes | No |
| VSCode Compare | Yes | Yes | One at a time | No |
| **branchdiff** | **Yes** | **Yes** | **Yes** | **Yes** |

## Documentation

- [**USAGE.md**](./docs/guideline/USAGE.md) — end-user install, commands, troubleshooting
- [**AI-REVIEW.md**](./docs/guideline/AI-REVIEW.md) — AI workflows: review, resolve, tour, summary (any agent, no plugin)
- [**DEVELOPMENT.md**](./docs/guideline/DEVELOPMENT.md) — contributor setup, build, local link, releasing
- [OVERVIEW.md](./docs/OVERVIEW.md) — architecture walkthrough
- [CHANGELOG.md](./packages/cli/CHANGELOG.md) — release notes

## Architecture

pnpm monorepo with 5 packages (only `cli` is published):

```
packages/
├── cli/      branchdiff — CLI + HTTP server (Node, esbuild)
├── git/      @branchdiff/git — git CLI wrappers (no library)
├── parser/   @branchdiff/parser — unified-diff parser
├── github/   @branchdiff/github — gh CLI integration
└── ui/       @branchdiff/ui — React Router 7 SPA (Vite, TanStack Query)
```

## Contributing

Bug reports and PRs welcome: <https://github.com/Encryptioner/branchdiff/issues>.

See [DEVELOPMENT.md](./docs/guideline/DEVELOPMENT.md) for setup.

## License

MIT — see [LICENSE.md](./LICENSE.md).

## Support

If you find my work useful, consider supporting it:

[![SupportKori](https://img.shields.io/badge/SupportKori-☕-FFDD00?style=flat-square)](https://www.supportkori.com/mirmursalinankur)


> Inspired by [Diffity](https://github.com/kamranahmedse/diffity)
