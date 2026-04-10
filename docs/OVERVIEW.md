# branchdiff — Overview & Architecture

> Inspired by [Diffity](https://github.com/kamranahmedse/diffity) — a visual git diff tool that opens in the browser.

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

### What VSCode "Compare with Branch" misses

VSCode file-level diff is correct, but:
- One file at a time — no overview across the whole branch
- IDE-only — not usable from terminal or headless

### The gap branchdiff fills

| Tool | Browser | File-level diff | Tab completion | All files |
|------|---------|----------------|----------------|-----------|
| `git diff` | No | No | No | Yes |
| `diff2html-cli` | Yes | No | No | Yes |
| VSCode Compare | Yes | Yes | No | One at a time |
| **branchdiff** | Yes | Yes | Yes | Yes |

---

## Initial Requirements

1. Compare all tracked files between two git branches (gitignored auto-excluded)
2. File-level diff — compare content at branch tip, not commit ancestry
3. Git-level diff mode available as fallback (`--mode git`)
4. Browser UI — localhost server, auto-opens on start
5. Tab completion for branch names in interactive CLI
6. Single branch shorthand — `branchdiff feat` = current branch vs feat
7. `origin/branch` remote refs supported
8. Multiple simultaneous instances — different ports or URL params
9. Large diff guard — show "Load diff" button instead of freezing browser
10. Continuous scroll — all file diffs visible without clicking

---

## What Is Done

- [x] CLI with interactive branch prompts + readline tab completion
- [x] File-level diff via `git ls-tree` + `git show` (no checkout needed)
- [x] Git-level diff mode via `git diff branch1..branch2`
- [x] Express HTTP server with REST API
- [x] Browser UI — continuous scroll, all diffs stacked
- [x] Folder tree sidebar with collapse/expand
- [x] Lazy-load diffs via IntersectionObserver (400–500px lookahead)
- [x] Large diff guard (>1500 patch lines → "Load diff" button)
- [x] "Viewed" checkbox per file
- [x] Sticky file block headers
- [x] Split / Unified view toggle
- [x] File / Git mode toggle (per session)
- [x] Search/filter in sidebar
- [x] URL query params (`?b1=main&b2=feat&mode=file`) — bookmarkable, multi-instance
- [x] Scroll spy — sidebar highlights active file as you scroll
- [x] `origin/branch` remote ref support (full ref preserved, not stripped)
- [x] Binary file detection (null byte heuristic)
- [x] Diffity-inspired light mode UI

---

## Architecture

```
branchdiff/
├── bin/
│   └── branchdiff.js     CLI entry — arg parsing, interactive prompts, starts server
├── src/
│   ├── git.js            Git operations (no git library — raw execSync)
│   └── server.js         Express server + API routes
├── public/
│   └── index.html        Single-page app (vanilla JS, diff2html via CDN)
└── docs/
    └── OVERVIEW.md       This file
```

### Data flow

```
CLI args / interactive prompt
        │
        ▼
  findGitRoot(cwd)          ← git rev-parse --show-toplevel
        │
        ▼
  getBranches(cwd)          ← git branch -a (universal, no format string)
        │
        ▼
  startServer({ b1, b2, port, mode, cwd })
        │
        ├── GET /api/config           session defaults
        ├── GET /api/compare          file list with statuses
        ├── GET /api/file-diff        per-file patch
        └── GET /api/branches         branch list for UI
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

Content fetch: `git show "branch:path/to/file"` — works without checkout, resolves remote refs (`origin/stage/prod`) via `refs/remotes/`.

Diff generation: npm `diff` package → `createTwoFilesPatch()` → unified patch format → diff2html renders in browser.

### 2. Remote branch refs — the stripping bug to avoid

**Wrong approach:** strip `origin/` → store `stage/prod` → `git ls-tree "stage/prod"` → resolves local ref → fails for remote-only branches → returns empty map → every file appears deleted.

**Right approach:** keep `origin/stage/prod` in the branch list. Git resolves `origin/stage/prod` → `refs/remotes/origin/stage/prod` automatically in all git commands.

```js
// In getBranches():
const name = b.startsWith('remotes/')
  ? b.slice('remotes/'.length)   // "remotes/origin/feat" → "origin/feat"
  : b;                           // local branch unchanged
```

### 3. Tab completion

Node's built-in `readline.createInterface` accepts a `completer` function:

```js
completer(line) {
  const hits = branches.filter(b => b.startsWith(line));
  return [hits.length ? hits : branches, line];
}
```

No extra dependencies. Tab = complete unambiguous. Tab×2 = list all matches.

### 4. Single-branch shorthand

```
branchdiff feat          →  b1 = currentBranch, b2 = feat
branchdiff main feat     →  b1 = main, b2 = feat
branchdiff (no args)     →  interactive prompt for both
```

Detected by: `branch1 && !branch2` after Commander parses args.

### 5. Lazy loading — IntersectionObserver

All file blocks render immediately as DOM (loading spinner state). Actual diff fetch triggers only when a block enters the viewport + 500px margin:

```js
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.isIntersecting && block.dataset.loaded === 'false') {
      fetchAndRender(block);
      observer.unobserve(block);
    }
  }
}, { root: mainScrollEl, rootMargin: '500px' });
```

`root: mainScrollEl` is critical — without it, IntersectionObserver uses viewport, which ignores the fixed header offset.

### 6. Multi-instance via URL params

Server bakes `b1`/`b2` into session config, but UI reads URL params first:

```
http://localhost:7823/?b1=main&b2=feat&mode=file
http://localhost:7824/?b1=main&b2=hotfix&mode=git   ← different port
```

Server prints the full URL with params on start. Browser history updated via `history.replaceState` to make URLs bookmarkable.

### 7. Folder tree sidebar

Flat `{ path, status }[]` → nested tree via recursive split on `/`:

```
src/components/Button.vue  →  { dirs: { src: { dirs: { components: { files: [Button.vue] } } } } }
```

Rendered recursively with `depth * 12` px left padding per level. Folder collapse state tracked in `Set<string>` of closed folder paths — survives search re-renders.

### 8. Large diff guard

After fetch, count patch lines. If `> 1500`:
- Show line count + `+added −removed` stats
- Show "Load diff" button
- Cache patch on `block.dataset.patch` so clicking Load doesn't re-fetch

Threshold chosen to avoid freezing browser on lock files, generated code, etc.

---

## API Routes

| Method | Path | Query params | Returns |
|--------|------|--------------|---------|
| GET | `/api/config` | — | `{ branch1, branch2, mode, repoName }` |
| GET | `/api/compare` | `b1`, `b2` | `{ files: [{path, status}], total }` |
| GET | `/api/file-diff` | `b1`, `b2`, `file`, `diffMode` | `{ patch, mode }` or `{ binary: true }` |
| GET | `/api/branches` | — | `{ branches, current }` |

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `express` | HTTP server |
| `diff` | Unified patch generation (`createTwoFilesPatch`) |
| `commander` | CLI arg parsing |
| `diff2html` (CDN) | Patch rendering in browser |

Zero runtime dependencies for git operations — all via `execSync` on the system git binary.

---

## Known Limitations / Future Work

- **Rename detection** — shows as delete + add; `git diff --find-renames` not yet integrated
- **Working tree comparison** — branch-to-branch only; could add `HEAD` or unstaged support
- **Binary files** — detected by null-byte heuristic, shown as "Binary file" with no diff
- **Syntax highlighting** — depends on diff2html's built-in highlight.js; no custom language config
- **Auth / multi-repo server** — currently single-repo per server instance

---

## Usage Reference

```bash
# Install
pnpm install
pnpm link --global        # makes `branchdiff` available globally

# Run (from inside any git repo)
branchdiff                       # interactive — Tab completes branch names
branchdiff feat                  # current branch vs feat
branchdiff main feat             # explicit both
branchdiff origin/stage/prod     # remote ref
branchdiff main feat --mode git  # commit-level diff
branchdiff main feat --port 7824 # custom port (for multi-instance)
branchdiff main feat --no-open   # don't auto-open browser
```
