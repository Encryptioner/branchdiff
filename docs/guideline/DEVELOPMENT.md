# Development guide

Working on `branchdiff` locally — cloning, building, running from source, linking into another project, and publishing releases.

For end-user install/usage see [USAGE.md](./USAGE.md).

---

## Repository layout

pnpm monorepo. Only `packages/cli` is published to npm (as **`branchdiff`**, unscoped). Other packages are internal and bundled into the CLI's dist at build time.

```
branchdiff/
├── packages/
│   ├── cli/          # branchdiff — the published package
│   ├── git/          # @branchdiff/git — git CLI wrappers + blob-diff
│   ├── github/       # @branchdiff/github — gh CLI integration
│   ├── parser/       # @branchdiff/parser — unified-diff parser
│   └── ui/           # @branchdiff/ui — React Router 7 client
├── scripts/
│   ├── build.ts      # monorepo build orchestration
│   ├── dev.ts        # dev-mode watcher
│   └── release/
│       └── release.sh  # version bump + tag + push
├── .github/workflows/
│   ├── ci.yml        # typecheck + build on PRs
│   └── publish.yml   # npm publish on v* tag
├── docs/
│   ├── OVERVIEW.md
│   ├── PLAN.md
│   └── guideline/    # ← you are here
└── package.json      # @branchdiff/root (private)
```

---

## Prerequisites

- **Node.js 20+** (hard requirement — React Router 7)
- **pnpm 10+** — `npm install -g pnpm` (repo is pinned to `pnpm@10.12.1`)
- **git**
- macOS / Linux / WSL

```bash
node --version   # v20.x or newer
pnpm --version   # 10.x or newer
```

---

## Clone & install

```bash
git clone https://github.com/Encryptioner/branchdiff.git
cd branchdiff
pnpm install
```

First install builds `better-sqlite3`'s native addon. If that fails, `pnpm rebuild better-sqlite3`.

---

## Build

```bash
pnpm build
```

What happens (`scripts/build.ts`):

1. `@branchdiff/parser` → `tsc` → `packages/parser/dist`
2. `@branchdiff/git` → `tsc` → `packages/git/dist`
3. `@branchdiff/github` → `tsc` → `packages/github/dist`
4. `@branchdiff/ui` → `react-router build` → `packages/cli/dist/ui/`
5. `branchdiff` (cli) → `esbuild` bundles everything above → `packages/cli/dist/index.js`
6. `README.md` + `LICENSE.md` are copied from the repo root into `packages/cli/` so they ship with the npm package

Artifacts:
- `packages/cli/dist/index.js` — the CLI entry (run with `node`)
- `packages/cli/dist/ui/client/` — static assets served by the CLI's HTTP server

---

## Run from source

```bash
pnpm dev
```

Uses `tsx` to run the CLI directly from TypeScript with UI in dev mode.

Or against the built dist:

```bash
pnpm build
cd /path/to/some/repo
node /path/to/branchdiff/packages/cli/dist/index.js main..feature
```

---

## Using your local build in another project

Three patterns, increasing "feels like a real install":

### 1. Direct invocation

```bash
cd /path/to/target-repo
node /absolute/path/to/branchdiff/packages/cli/dist/index.js
```

### 2. `pnpm link --global`

```bash
# inside the branchdiff repo
pnpm build
cd packages/cli
pnpm link --global

# now in any terminal
branchdiff --version          # your local build
```

Unlink: `cd packages/cli && pnpm unlink --global`.

### 3. `pnpm pack` → install from tarball

Closest to the real `npm install branchdiff` experience:

```bash
cd packages/cli
pnpm pack
# produces branchdiff-0.1.0.tgz

# in another project
pnpm add /absolute/path/to/branchdiff-0.1.0.tgz
```

Tip: `npm pack --dry-run` previews the file list without writing.

---

## Testing

```bash
pnpm test          # git + parser + ui
pnpm typecheck     # all packages
```

Individual package:

```bash
pnpm --filter @branchdiff/git test
pnpm --filter @branchdiff/git test:watch
```

---

## Releasing to npm

Releases are **tag-driven and fully automated** via GitHub Actions. You bump the version and push a tag; CI builds, publishes to npm with provenance, and creates a GitHub release.

### One-time setup (project owner only)

Required once per repo:

1. **Create a granular npm access token**
   - npm → *Profile* → *Access Tokens* → *Generate New Token* → **Granular Access Token**
   - Token name: `branchdiff GitHub Actions`
   - Expiration: 90 days (or your preference)
   - Packages and scopes: **Read and write** → select package `branchdiff`
   - Copy the token (starts with `npm_…`) — you won't see it again.

2. **Add it to GitHub**
   - Your GitHub repo → *Settings* → *Secrets and variables* → *Actions*
   - *New repository secret* → name `NPM_TOKEN`, value the token → *Add*.

3. **Confirm npm name ownership**
   - First publish auto-claims the `branchdiff` name (if available).
   - Check: `npm view branchdiff` — 404 means available.

### Release flow (every release)

```bash
# 0. Update the changelog
#    edit packages/cli/CHANGELOG.md with the new version's notes
git add packages/cli/CHANGELOG.md
git commit -m "docs: changelog for vX.Y.Z"

# 1. Run the release script — bumps version, commits, tags, pushes
pnpm run release:patch   # 0.1.0 → 0.1.1 (bug fixes)
# or
pnpm run release:minor   # 0.1.0 → 0.2.0 (new features)
# or
pnpm run release:major   # 0.1.0 → 1.0.0 (breaking changes)

# 2. Watch GitHub Actions publish it
#    https://github.com/Encryptioner/branchdiff/actions

# 3. Verify on npm (within a minute)
npm view branchdiff version
```

The `release.sh` script:
1. Checks the working tree is clean and you're on `master` (override `RELEASE_ALLOW_BRANCH=1` for hotfix branches).
2. Runs `pnpm build` as a local smoke test.
3. Bumps `packages/cli/package.json` version.
4. Commits, tags `vX.Y.Z`, pushes branch + tag to the GitHub remote.
5. `.github/workflows/publish.yml` fires on the tag:
   - `pnpm typecheck` + `pnpm build` on Ubuntu / Node 20
   - Verifies `packages/cli/package.json` version matches the tag
   - `npm pack --dry-run` to log what ships
   - `pnpm publish --access public --provenance` from `packages/cli/`
   - Creates a GitHub release with auto-generated notes

### Manual publish (emergency)

If Actions are down or you need a local-only dry-run:

```bash
pnpm pack:dry              # preview shipped files
pnpm run release:publish   # clean + build + pnpm publish --provenance (local npm auth)
```

You'll need `npm login` first. Prefer the tag-driven flow — it leaves a clean audit trail.

### Previewing what ships

```bash
pnpm pack:dry
# runs a full build then `npm pack --dry-run` from packages/cli
```

Expected contents: `dist/index.js`, `dist/ui/client/**`, `README.md`, `LICENSE.md`, `CHANGELOG.md`, `package.json`. Tarball should be ~3 MB (the Shiki grammar chunks are the bulk — they lazy-load at runtime so they don't cost first-paint).

### If a release fails mid-publish

- `NPM_TOKEN` expired → rotate it, re-run the workflow from the Actions tab (workflow_dispatch accepts the tag).
- Wrong version in `package.json` → the workflow fails fast on the version-check step; bump properly and re-tag.
- Already published version → npm rejects republishes. Bump to the next patch and re-tag.

Unpublish (within 24h, if you really must):

```bash
npm unpublish branchdiff@X.Y.Z
```

After 24h, use `npm deprecate branchdiff@X.Y.Z "broken, use X.Y.Z+1"` instead.

---

## Versioning

Follow [semver](https://semver.org):

- **patch** (0.1.0 → 0.1.1) — bug fixes, no API change
- **minor** (0.1.0 → 0.2.0) — new CLI flags, new commands, backwards-compatible
- **major** (0.1.0 → 1.0.0) — removed flags, changed defaults, breaking UX

Update `packages/cli/CHANGELOG.md` on every release.

---

## Troubleshooting

### `pnpm build` — UI server build fails
Expected on pnpm strict mode. `scripts/build.ts` catches it and regenerates `index.html` from the Vite manifest.

### Native module errors after switching Node versions
```bash
pnpm rebuild
```

### `pnpm link` didn't take effect
```bash
pnpm root -g
echo $PATH | tr ':' '\n' | grep pnpm
```
Make sure `$(pnpm root -g)/../bin` is on your `PATH`.

### Workspace package imports fail at runtime
Run `pnpm build` — the CLI bundles the workspace packages; they must be built (or `tsx` must be running them directly in dev).

---

## See also

- [USAGE.md](./USAGE.md) — end-user install and commands
- [../OVERVIEW.md](../OVERVIEW.md) — architecture
- [../PLAN.md](../PLAN.md) — build plan and phase tracking
- [root CLAUDE.md](../../CLAUDE.md) — AI-assist conventions
