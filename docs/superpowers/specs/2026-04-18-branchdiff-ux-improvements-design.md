# branchdiff UX Improvements — Design Spec

**Date**: 2026-04-18  
**Status**: Approved  
**Scope**: Bug 1 (CLI tab completion), Bug 2 (summary stats accuracy), Feature (delta mode)

---

## 1. CLI Tab Completion Fix

### Problem
Shell tab-completion for branches does not work after install. Root cause: `installZsh()` uses `appendFileSync` to add `fpath+=~/.zfunc` at the **end** of `.zshrc`. Oh-my-zsh (and most zsh frameworks) call `compinit` earlier in `.zshrc`, so the fpath update is never picked up by the completion system.

### Solution: Source-based approach

**`packages/cli/src/completions/zsh.sh`**
- Remove `#compdef branchdiff` directive (requires fpath/autoload — broken with append approach)
- Remove `_branchdiff "$@"` call at bottom (fpath autoload invocation)
- Add `compdef _branchdiff branchdiff` at the bottom (works when sourced after compinit)

**`packages/cli/src/commands/completion.ts` — `installZsh()`**
- Instead of appending `fpath+=~/.zfunc`, append `source ~/.zfunc/_branchdiff`
- Since this line runs after oh-my-zsh in `.zshrc`, `compdef` is called after `compinit` — correct order
- Update `removeOldEvalLine()` to also strip: `fpath+=~/.zfunc` lines and `source ~/.zfunc/_branchdiff` lines (for clean upgrades across versions)
- Guard: only append if `_branchdiff` not already in `.zshrc`

**No changes needed to `bash.sh`** — bash completion (`complete -F`) does not have ordering constraints.

---

## 2. Summary Stats Accuracy Fix

### Problem
In branch-comparison mode, the toolbar shows `filesChanged`, `totalAdditions`, `totalDeletions`. `filesChanged` is accurate (uses `branchData.total`). But `totalAdditions` and `totalDeletions` are computed client-side by summing `fileDiff?.additions || 0` over all files — starting at 0 and growing as files lazy-load into viewport, causing the numbers to visibly change.

### Solution: Server-side line stats in `/api/compare`

**Server (`packages/cli/src/server.ts`)**  
- In the `/api/compare` handler, after computing the file list, run one additional `git diff --stat b1 b2` call (or sum from already-computed blob diffs)
- Add `lineStats: { additions: number; deletions: number }` to the response
- For `mode=git`: parse from `git diff --stat` output
- For `mode=file`: sum additions/deletions from already-iterated blob comparisons (no extra git call needed — the blob diff loop already has per-file stats)

**Client (`packages/ui/src/lib/api.ts`)**  
- Add `lineStats: { additions: number; deletions: number }` to `BranchComparison` interface

**Client (`packages/ui/src/components/diff/diff-page.tsx`)**  
- Replace client-side `totalAdditions`/`totalDeletions` accumulation with `branchData.lineStats.additions` / `branchData.lineStats.deletions`
- `filesChanged` already uses `branchData.total` — no change needed
- Per-file `additions`/`deletions` still lazy-load for file-block display — no change

---

## 3. Delta Mode (Δ) — File vs Git Mode Comparison

### Overview
A third option in the branch-comparison mode toggle (alongside "File" and "Git") that shows a summary comparison between what file-mode and git-mode each report for the same branch pair. Helps users understand history noise without manually switching modes.

### Mode Toggle Change
`SegmentedToggle` in toolbar gains a third option: `{ value: 'delta', label: 'Δ' }`. Only shown in branch-comparison mode (same condition as File/Git toggle today).

### Data Fetching
When `mode === 'delta'`:
- Fetch `/api/compare?b1=X&b2=Y&mode=file` and `/api/compare?b1=X&b2=Y&mode=git` in **parallel**
- Both responses are likely cached if user has already viewed either mode
- Compute set differences client-side:
  - `gitOnlyPaths` = paths in git result but not in file result
  - `fileOnlyPaths` = paths in file result but not in git result  
  - `sharedPaths` = paths in both results

### Delta View Layout
Replaces the normal `DiffView` when delta mode is active. Rendered in `diff-page.tsx` as a separate branch.

```
┌─ GIT ONLY  (N files — history noise) ──────────────────────────┐
│  File exists at both branch tips with identical content,        │
│  but git diff includes it due to commit-path differences.       │
│                                                                 │
│  ▶ src/api/handler.ts                          git: +12 −4      │
│    ── on expand: git-mode diff preview (first 20 lines) ──      │
│    + import { newUtil } from './utils'                          │
│    - const oldHelper = createHelper()                           │
└─────────────────────────────────────────────────────────────────┘

┌─ FILE ONLY  (N files) ──────────────────────────────────────────┐
│  File content differs at branch tips but git diff omits it.     │
│  ▶ src/legacy.ts                               file: +3 −1      │
│    ── on expand: file-mode diff preview ──                       │
└─────────────────────────────────────────────────────────────────┘

┌─ IN BOTH  (N files — actual changes) ───────────────────────────┐
│  Both modes agree the file changed. Shows delta in line counts  │
│  and highlights lines present in one mode but not the other.    │
│                                                                 │
│  ▶ src/Button.tsx          git: +8 −2  │  file: +6 −2  Δ +2    │
│    ── on expand ──                                              │
│    [amber] Lines only in git diff:                              │
│    + // legacy comment                                          │
│    + console.log('debug')                                       │
│    [blue]  Lines only in file diff:                             │
│    (none)                                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Per-File Expansion (lazy)
Each file row is collapsed by default. On expand:
- **git-only / file-only files**: fetch `fileDiffOptions(b1, b2, path, mode)` for the relevant mode. Show first 20 diff lines as preview with truncation indicator if more.
- **shared files**: fetch both `fileDiffOptions(b1, b2, path, 'file')` AND `fileDiffOptions(b1, b2, path, 'git')`. Compute line-level delta:
  - Parse changed lines from each diff (add/delete lines, ignoring context)
  - Lines in git diff not in file diff → rendered with amber left-border + "git only" badge
  - Lines in file diff not in git diff → rendered with blue left-border + "file only" badge
  - Lines in both → rendered normally

### New Component: `DeltaView`
`packages/ui/src/components/diff/delta-view.tsx`
- Props: `b1`, `b2`, `gitFiles: BranchDiffFile[]`, `fileFiles: BranchDiffFile[]`
- Internal state: `expandedPaths: Set<string>`
- Renders three sections (git-only, file-only, shared) using `DeltaFileRow` sub-component

### New Component: `DeltaFileRow`
`packages/ui/src/components/diff/delta-file-row.tsx`
- Props: `path`, `category: 'git-only' | 'file-only' | 'shared'`, `gitStat`, `fileStat`, `b1`, `b2`
- On expand: lazy-fetches diff(s) and renders preview with amber/blue line annotations
- Uses `fileDiffOptions` from existing TanStack Query cache

### Color Tokens (reuse existing or add)
- Amber (git-only): `bg-amber-50 dark:bg-amber-950/40`, border `border-amber-300 dark:border-amber-700`
- Blue (file-only): `bg-blue-50 dark:bg-blue-950/40`, border `border-blue-300 dark:border-blue-700`
- Existing `diff-hunk-bg` / `diff-hunk-text` for section headers

### URL / State
- `mode=delta` added to URL params (same replaceState pattern as file/git)
- `useBranchComparison` not called in delta mode (replaced by two parallel fetches)
- Delta mode only available when `isBranchComparison === true`

### Empty States
- All three sections empty: "No differences between modes" message
- Individual empty sections: omit the section header entirely

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `packages/cli/src/completions/zsh.sh` | Modify |
| `packages/cli/src/commands/completion.ts` | Modify |
| `packages/cli/src/server.ts` | Modify (add lineStats to /api/compare) |
| `packages/ui/src/lib/api.ts` | Modify (add lineStats to BranchComparison) |
| `packages/ui/src/components/diff/diff-page.tsx` | Modify (use lineStats, add delta mode branch) |
| `packages/ui/src/components/layout/toolbar.tsx` | Modify (add Δ to mode toggle) |
| `packages/ui/src/components/diff/delta-view.tsx` | Create |
| `packages/ui/src/components/diff/delta-file-row.tsx` | Create |

---

## Non-Goals
- No changes to bash completion (it doesn't have the ordering problem)
- No new API endpoints for delta mode (uses existing `/api/compare` and `/api/file-diff`)
- No virtualization for delta view (file counts in delta mode are typically small)
- No comment/review features in delta view
