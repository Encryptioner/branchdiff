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
- Node 20+ required (React Router 7 dependency)
- Node 18 works for CLI/git/parser but not UI build

## Branch Comparison Modes
- `mode=file` (default): blob hash comparison via `getBlobMap()` → `compareBranches()`
- `mode=git`: standard `git diff branch1..branch2`
- API routes: `/api/compare`, `/api/file-diff`, `/api/branches`, `/api/config`

## Files to Know
- `packages/git/src/blob-diff.ts` — core file-level diff logic
- `packages/cli/src/server.ts` — all API routes
- `packages/cli/src/review-routes.ts` — comment + agent endpoints
- `packages/ui/src/routes/diff.tsx` — main diff page route
- `docs/PLAN.md` — full build plan and phase tracking
