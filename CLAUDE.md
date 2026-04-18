# branchdiff — Project Conventions

## Build Commands
- `pnpm build` — build all packages (parser → git → github → ui → cli)
- `pnpm run dev` — dev mode with watch

## Architecture
- pnpm monorepo: cli, git, parser, github, ui
- CLI uses esbuild, UI uses React Router 7 + Vite
- Server is plain Node HTTP (not Express)
- Git operations via raw CLI exec (no library)
- Comments stored in SQLite via better-sqlite3

## Key Patterns
- `@branchdiff/*` package namespace
- ESM throughout (type: module)
- TypeScript strict mode
- TanStack Query for data fetching in UI

## Node Version
- Node 18+ supported for the published npm package (CLI)
- Node 20+ required for UI build (React Router 7 dependency)
- CI tests across Node 18, 20, 22, 24

## Branch Comparison Modes
- `mode=file` (default): blob hash comparison via `getBlobMap()` → `compareBranches()` — skips files with identical content regardless of commit ancestry
- `mode=git`: `git diff b1..b2` (two-dot, tip-vs-tip) — surfaces commit-path noise
- API routes: `/api/compare`, `/api/file-diff`, `/api/branches`, `/api/config`
- `/api/file-diff` returns `{ patch, files, content1, content2 }` — both full file contents are always included, so the client never needs a second round-trip for full-file view.
- `b1` / `b2` are **any valid git ref**: branch name, commit SHA (short or full), tag, `HEAD~N`, `origin/<branch>`. Validation is `git rev-parse --verify` in `isValidGitRef` (packages/git/src/repo.ts). No branch-only gating anywhere.

## UI Conventions
- Modals use the native `<dialog>` element — see `shortcut-modal.tsx` for the canonical pattern (`showModal()` in effect, `::backdrop` styling, backdrop-click closes).
- File list virtualization lives in `diff-view.tsx` via `@tanstack/react-virtual` — at the file level only. Hunks/lines inside a file are not virtualized; large files are gated behind the `LARGE_DIFF_LINE_THRESHOLD = 200` placeholder in `file-block.tsx`.
- TanStack Query cache keys live in `packages/ui/src/queries/*` — reuse these options objects rather than calling `fetch` directly.

## Performance Gotchas
- `diff-page.tsx` previously pre-fetched `/api/file-diff` for every changed file via `Promise.all`. Lazy-load on viewport intersection instead — a 500-file PR will DoS the server otherwise.
- `server.ts` uses `execSync` for git calls, which blocks the entire Node HTTP thread. Prefer `execFile` (promisified) on hot paths.
- Shiki and Mermaid are heavy. Both are now dynamic-imported: Shiki core in `use-highlighter.ts`, Mermaid in `mermaid-diagram.tsx`. Keep them that way — static-imports in any file consumed from the root bundle will re-bloat first paint.

## Publishing to npm
- Published package: **`@encryptioner/branchdiff`** (scoped, lives in `packages/cli/`, `name` in `package.json`). CLI command remains `branchdiff`. Root is `@branchdiff/root` and `private: true`.
- Release flow: `pnpm run release:patch|minor|major` → bumps `packages/cli/package.json`, commits, tags `vX.Y.Z`, pushes. `.github/workflows/publish.yml` fires on the tag and publishes with provenance.
- CI workflow: `.github/workflows/ci.yml` runs build + typecheck on push/PR to `master` across Node 18/20/22/24.
- Required GitHub secret: `NPM_TOKEN` — a *Granular Access Token* with read+write permission on the `branchdiff` package.
- `scripts/build.ts` copies root `README.md` + `LICENSE.md` into `packages/cli/` before publish; CHANGELOG lives in the cli package.
- Shell completion: `packages/cli/src/completions/zsh.sh` and `bash.sh` are inlined via esbuild's `loader: { '.sh': 'text' }`. `branchdiff completion install` writes to `~/.zfunc/_branchdiff` (zsh) or `~/.local/share/bash-completion/completions/branchdiff` (bash).
- Before any release, `pnpm pack:dry` previews shipped contents (`dist/`, README, LICENSE, CHANGELOG).

## Files to Know
- `packages/git/src/blob-diff.ts` — core file-level diff logic (`compareBranches`, `getBranchFileContent`)
- `packages/cli/src/server.ts` — all API routes; `/api/compare` (line ~599), `/api/file-diff` (line ~648)
- `packages/cli/src/review-routes.ts` — comment + agent endpoints
- `packages/ui/src/routes/diff.tsx` — main diff page loader
- `packages/ui/src/components/diff/diff-page.tsx` — orchestrates state, drives DiffView
- `packages/ui/src/components/diff/file-block.tsx` — per-file rendering, gap expansion, Shiki highlighting
- `packages/ui/src/components/layout/shortcut-modal.tsx` — modal pattern reference
- `docs/PLAN.md` — full build plan and phase tracking
