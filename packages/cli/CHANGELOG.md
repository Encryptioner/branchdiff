# Changelog

All notable changes to `branchdiff` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `docs/guideline/AI-REVIEW.md` — prompt templates for any AI assistant (Claude Code, Cursor, Codex, Copilot, Gemini) across 8 workflows: review, resolve, tour, summary, security audit, test-coverage gaps, migration/breaking change, dependency review. Uses `branchdiff agent *` + `/api/threads/export`. No plugin or skills install required.
- Word-level intra-line diff in the full-file compare **unified** view — changed tokens on delete/add line pairs get highlighted via `computeWordDiff` (2000-char guard for pathological lines). Syntax colors are preserved under the highlight.
- Full-file compare popup (Bitbucket-style side-by-side) per changed file in branch-compare mode.
- Resizable sidebar with localStorage-persisted width.
- Commit history sidebar with hover tooltips showing full message + author + relative date.
- Commit-to-commit comparison for any git ref (SHA, tag, `HEAD~N`, `origin/<branch>`).
- `.github/workflows/publish.yml` — tag-triggered npm publish with provenance.
- `.github/workflows/ci.yml` — typecheck + build on push/PR (Node 20, 22).
- `scripts/release/release.sh` — `pnpm run release:patch|minor|major` wrappers.
- `.github/FUNDING.yml`.

### Changed
- Package renamed from `@encryptioner/branchdiff` to **`branchdiff`** (unscoped on npm).
- Shiki (syntax highlighter) dynamic-imported; language grammars loaded on demand.
- Mermaid dynamic-imported — only loaded when a diff contains a diagram.
- Virtualized file list rendering for large PRs.
- Hot git endpoints migrated from `execSync` to `execFile` (no HTTP thread blocking).

### Fixed
- Markdown export of review threads referenced undefined `dismiss` variable (now `dismissed`). Runtime error on `/api/threads/export?format=markdown`.

## [0.1.0] - 2026-04-10

### Added
- Initial npm release.
- File-level branch comparison via blob-hash diffing (`--mode file`).
- Standard git-diff mode (`--mode git`).
- Browser-based UI with split and unified views.
- Multi-instance support — auto-incrementing ports from 5391 with registry at `~/.branchdiff/registry.json`.
- GitHub PR checkout via URL (`branchdiff https://github.com/owner/repo/pull/123`).
- Comment export and AI agent endpoints.
- Commands: `list`, `kill`, `prune`, `tree`, `open`, `doctor`, `update`.
