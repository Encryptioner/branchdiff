# branchdiff — Full Build Plan

## Context

branchdiff is a visual git branch diff tool. The POC (`bin/branchdiff.js`, `src/git.js`, `src/server.js`, `public/index.html`) proves the core concept: **file-level diff** comparing blob hashes at branch tips instead of commit ancestry. Diffity (cloned in `.worktrees/diffity/`) provides a mature React monorepo with diff viewing, comments, GitHub PR, keyboard shortcuts, themes, virtual scrolling, and syntax highlighting.

**Goal**: Clone Diffity's architecture (as a clean copy, not a GitHub fork), rebrand as branchdiff, and add the POC's unique file-level diff features + AI-friendly comment export.

---

## Phase 1: Clone & Rebrand (Foundation)

### 1.1 Copy Diffity monorepo structure into branchdiff
- Source files already available in `.worktrees/diffity/` (cloned, not forked — avoids "forked from" badge on GitHub)
- Copy `packages/` (cli, git, parser, ui) from `.worktrees/diffity/`
- Skip `packages/github` (GitHub PR-specific) and `packages/skills` (AI skills)
- Copy root config: `tsconfig.json`, `scripts/`
- Create new `package.json` with workspace references
- Adapt build scripts for branchdiff
- Remove Diffity's `.git` history — branchdiff gets a clean repo with only its own commits

### 1.2 Rebrand
- Package names: `@diffity/*` → `@branchdiff/*` (or just `branchdiff`)
- CLI name: `diffity` → `branchdiff`
- UI branding: logo, favicon, page titles
- All descriptions updated

### 1.3 Update dependencies
- `pnpm-workspace.yaml` for monorepo (convert from npm workspaces)
- Root `package.json` with workspace config
- Build toolchain: esbuild, vite, typescript

**Files to create/modify:**
- `/package.json` (root workspace)
- `/pnpm-workspace.yaml`
- `/packages/cli/package.json`
- `/packages/git/package.json`
- `/packages/parser/package.json`
- `/packages/ui/package.json`
- `/tsconfig.json`

---

## Phase 2: Core Branch Diff Features (POC integration)

### 2.1 Git package — file-level diff mode
Add to `packages/git/src/`:

```
getBlobMap(branch, cwd)           → { filePath: { hash, mode } }
compareBranches(b1, b2, cwd)     → { path, status }[]
getFileContent(branch, path, cwd) → string | null
```

These come directly from POC's `src/git.js` but in TypeScript.

**Key files:**
- `packages/git/src/blob-diff.ts` (new)
- `packages/git/src/index.ts` (re-export)

### 2.2 Parser — support file-level patches
The existing `parseDiff()` works on unified diff output. File-level diff uses `diff` npm package's `createTwoFilesPatch()`. The parser already handles this format — minimal changes needed.

**Key files:**
- `packages/parser/src/parse.ts` (may need minor adjustments)

### 2.3 CLI — branch comparison mode
Extend CLI to support branch comparison as a first-class use case:

```
branchdiff                        # interactive branch prompts
branchdiff feat                   # current vs feat
branchdiff main feat              # explicit two branches
branchdiff origin/stage/prod      # remote ref support
branchdiff main feat --mode git   # git-level diff fallback
branchdiff main feat --mode file  # file-level (default)
branchdiff tree                   # file browser
```

Add interactive readline prompts with tab completion from POC.

**Key files:**
- `packages/cli/src/index.ts` — extend arg parsing
- `packages/cli/src/branch-prompt.ts` (new) — interactive readline

### 2.4 Server — branch diff API routes
Add routes for branch comparison:

```
GET /api/compare?b1=X&b2=Y&mode=file|git   → { files, total }
GET /api/file-diff?b1=X&b2=Y&file=PATH     → { patch, mode }
GET /api/branches                            → { branches, current }
GET /api/config                              → { branch1, branch2, mode, repoName }
```

Keep existing Diffity routes (`/api/diff`, `/api/info`, `/api/overview`) for working tree diff.

**Key files:**
- `packages/cli/src/server.ts` — add branch routes
- `packages/cli/src/branch-routes.ts` (new)

---

## Phase 3: UI — Branch Comparison Interface

### 3.1 Branch selector in toolbar
- Dropdown to change branches without restarting server
- Preserves current view mode and scroll position

### 3.2 File/Git mode toggle
- Already have split/unified toggle from Diffity
- Add "File" / "Git" mode toggle (like POC)
- File mode = blob hash comparison
- Git mode = `git diff` commit-level

### 3.3 URL params for bookmarking
- `?b1=main&b2=feat&mode=file&view=split&theme=dark`
- Multiple instances via different ports

### 3.4 Folder tree sidebar
- Diffity already has virtualized file tree with search
- Add status badges (A/M/D) per file
- Scroll spy to highlight active file

**Key files:**
- `packages/ui/src/components/layout/toolbar.tsx`
- `packages/ui/src/components/layout/sidebar.tsx`
- `packages/ui/src/components/diff/diff-page.tsx`
- `packages/ui/src/routes/diff.tsx`

---

## Phase 4: AI-Friendly Comment System

### 4.1 Comment storage (SQLite — reuse Diffity's)
- Thread-based comments on files/lines
- Severity tags: `[must-fix]`, `[suggestion]`, `[nit]`, `[question]`
- Status: open / resolved / dismissed

### 4.2 Structured comment export
API endpoint for AI consumption:

```
GET /api/threads/export?format=json   → structured JSON
GET /api/threads/export?format=markdown → markdown summary
GET /api/threads/export?status=open   → only open threads
```

JSON format:
```json
{
  "summary": { "total": 5, "open": 3, "resolved": 2 },
  "threads": [
    {
      "id": "...",
      "filePath": "src/auth.ts",
      "lines": "45-52",
      "severity": "must-fix",
      "status": "open",
      "comments": [
        { "author": "user", "body": "SQL injection risk here" }
      ]
    }
  ]
}
```

### 4.3 CLI agent endpoint (future-ready)
```
POST /api/agent/comment     → AI posts review comment
GET  /api/agent/threads     → AI reads all threads
POST /api/agent/resolve     → AI marks thread resolved
```

Design these now, implement fully in Phase 2 (AI features).

**Key files:**
- `packages/cli/src/review-routes.ts` (extend from Diffity)
- `packages/cli/src/agent.ts` (adapt from Diffity)

---

## Phase 5: Polish & Ship

### 5.1 README.md
- "Inspired by [Diffity](https://github.com/kamranahmedse/diffity)" — credit where due, but no fork link on profile
- Use cases: why git diff is problematic, how file-level diff helps
- Install & usage instructions
- Screenshots (after UI is built)

### 5.2 CLAUDE.md
- Project conventions, commands, architecture

### 5.3 Docs
- `docs/OVERVIEW.md` (update existing)
- `docs/SPEC.md` (feature specification)

### 5.4 Package & publish
- npm package as `branchdiff`
- `pnpm link --global` for local dev
- GitHub Actions for publish (future)

---

## Execution Order

1. **Phase 1** — Clone & rebrand (foundation to build on)
2. **Phase 2** — Git + CLI + Server (backend features)
3. **Phase 3** — UI (frontend)
4. **Phase 4** — Comment system with AI export
5. **Phase 5** — Docs, README, CLAUDE.md, polish

---

## Verification

1. `pnpm install && pnpm build` — compiles without errors
2. `branchdiff main feat` — opens browser, shows file-level diff
3. `branchdiff main feat --mode git` — shows commit-level diff
4. `branchdiff` — interactive prompts with tab completion
5. `branchdiff origin/stage/prod` — remote refs work
6. Split/unified toggle works in UI
7. File/git mode toggle works
8. Comments can be created and exported as JSON/markdown
9. Keyboard shortcuts work (j/k for file nav, etc.)
10. Dark/light theme toggle works

---

## Key Differentiators from Diffity

| Feature | Diffity | branchdiff |
|---------|---------|------------|
| Primary use case | Working tree diff | Branch comparison |
| Diff method | git diff (commit ancestry) | File-level blob comparison (default) + git fallback |
| Single branch shorthand | No | Yes (`branchdiff feat`) |
| Remote refs | No special handling | `origin/branch` fully supported |
| Same content, different history | Shows noise | Shows no diff (correct) |
| AI comment export | Agent-specific | Structured JSON/markdown export for any AI tool |
