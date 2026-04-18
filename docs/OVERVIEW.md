# branchdiff — Overview & Architecture

A visual git branch / commit / working-tree diff tool that opens in your browser. Runs 100% locally.

---

## Problem Statement

### Why `git diff` is not enough

`git diff branch1..branch2` compares **commit history divergence**, not file content:

```
main:  A → B → C → D   (file.js = "hello world")
feat:  A → X → Y       (file.js = "hello world")

git diff main..feat  →  shows diff  (different commit paths)
branchdiff main feat →  no diff     (same content — correct)
```

If two branches reached the same file state via different commits (rebase, cherry-pick, squash), `git diff` shows noise. branchdiff compares what files **actually are** at each branch tip.

---

## Architecture

```
branchdiff/
├── packages/
│   ├── cli/              CLI + HTTP server (esbuild bundle)
│   │   ├── src/
│   │   │   ├── index.ts        Commander CLI entry
│   │   │   ├── server.ts       Node HTTP server + API routes
│   │   │   ├── review-routes.ts Thread/comment + export + agent routes
│   │   │   ├── threads.ts      SQLite-backed thread/comment storage
│   │   │   ├── session.ts      Session management
│   │   │   └── ...
│   │   └── build.ts           esbuild config
│   ├── git/              Git operations package
│   │   └── src/
│   │       ├── blob-diff.ts    File-level diff (blob hash comparison)
│   │       ├── diff.ts         Standard git diff operations
│   │       ├── repo.ts         Repo info, branch detection
│   │       ├── tree.ts         File tree operations
│   │       └── ...
│   ├── parser/           Diff output parser
│   │   └── src/parse.ts        Unified diff → structured data
│   ├── github/           GitHub PR integration
│   └── ui/               React Router 7 SPA (Vite)
│       └── src/
│           ├── routes/diff.ts  Diff page with branch comparison
│           ├── queries/        TanStack Query options
│           ├── hooks/          Data hooks (useDiff, useBranchComparison)
│           └── components/     React components
├── scripts/
│   └── build.ts          Monorepo build orchestration
├── docs/
│   ├── OVERVIEW.md       This file
│   ├── PLAN.md           Full build plan
│   └── SPEC.md           Feature specification
└── pnpm-workspace.yaml
```

### Data flow

```
CLI args / interactive prompt
        │
        ▼
  startServer({ diffArgs, branch1, branch2, mode })
        │
        ├── Branch comparison mode (mode=git default, or mode=file):
        │   ├── GET /api/compare?b1=X&b2=Y     file list with statuses
        │   ├── GET /api/file-diff?b1=X&b2=Y&file=PATH  per-file patch
        │   └── GET /api/branches               branch list for UI
        │
        ├── Working tree mode (default):
        │   ├── GET /api/diff?ref=X              unified diff
        │   ├── GET /api/overview                file status overview
        │   └── GET /api/info                    repo metadata
        │
        └── Shared:
            ├── GET /api/config                  session config
            ├── GET /api/threads/export          comment export (JSON/Markdown)
            └── Agent endpoints                  AI agent integration
```

---

## Core Technical Approaches

### 1. File-level diff (the key insight)

Git stores every file version as a **blob** with a SHA-1 hash. Same content = same hash, regardless of commit history.

```
git ls-tree -r branch
→ 100644 blob a3f9c2d  src/foo.js    ← blob hash

git ls-tree -r branch2
→ 100644 blob a3f9c2d  src/foo.js    ← SAME hash → skip (no fetch needed)
→ 100644 blob f2c0011  src/bar.js    ← different → fetch both, diff
```

`getBlobMap(branch)` returns `{ filePath → { hash, mode } }`. Comparing maps is O(n) on file count — only files with different hashes get their content fetched.

### 2. Dual mode: file-level + git-level

```
branchdiff main feat --mode file   # blob hash comparison (file-level)
branchdiff main feat --mode git    # git diff (default, commit ancestry)
```

File mode skips identical content regardless of history. Git mode shows commit-level changes.

### 3. AI-friendly comment export

Comments support severity tags (`[must-fix]`, `[suggestion]`, `[nit]`, `[question]`) and export:

```
GET /api/threads/export?session=X&format=json     → structured JSON
GET /api/threads/export?session=X&format=markdown  → markdown summary
GET /api/threads/export?session=X&status=open      → only open threads
```

Agent endpoints for AI integration:
```
POST /api/agent/comment     → AI posts review comment
GET  /api/agent/threads     → AI reads all threads
POST /api/agent/resolve     → AI marks thread resolved
```

---

## API Routes

### Branch comparison routes
| Method | Path | Query params | Returns |
|--------|------|--------------|---------|
| GET | `/api/branches` | — | `{ branches, current }` |
| GET | `/api/compare` | `b1`, `b2` | `{ files, total, lineStats: { additions, deletions } }` |
| GET | `/api/file-diff` | `b1`, `b2`, `file` | `{ patch, files, content1, content2 }` |
| GET | `/api/config` | `b1`, `b2`, `mode` | `{ branch1, branch2, mode, repoName }` |

### Working tree routes
| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/diff` | Unified diff for working tree or ref |
| GET | `/api/info` | Repo metadata |
| GET | `/api/overview` | File status overview |

### Comment routes
| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/threads/export` | JSON or Markdown export |
| GET | `/api/agent/threads` | All threads for session |
| POST | `/api/agent/comment` | Create agent comment |
| POST | `/api/agent/resolve` | Resolve thread |

---

## Usage Reference

```bash
# Build
pnpm install
pnpm build

# Run (from inside any git repo)
branchdiff                              # see all uncommitted changes
branchdiff main                         # current branch vs main
branchdiff main feat                    # branch comparison (file-level)
branchdiff main feat --mode git         # commit-level diff
branchdiff origin/stage/prod            # remote ref
branchdiff main feat --port 7824        # custom port
branchdiff main feat --no-open          # don't auto-open browser
branchdiff main feat --dark --unified   # dark mode, unified view
branchdiff tree                         # file browser mode
```
