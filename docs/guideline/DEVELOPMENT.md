# Development guide

This doc covers working on `branchdiff` locally — cloning the monorepo,
building, running from source, linking into another project, and publishing
releases.

For end-user install/usage see [USAGE.md](./USAGE.md).

---

## Repository layout

This is a **pnpm monorepo**. Only `packages/cli` is published to npm (as
`@encryptioner/branchdiff`); the other packages are internal and bundled into
the CLI's dist at build time.

```
branchdiff/
├── packages/
│   ├── cli/          # @encryptioner/branchdiff — the published package
│   ├── git/          # @branchdiff/git — git CLI wrappers + blob-diff
│   ├── github/       # @branchdiff/github — gh CLI integration
│   ├── parser/       # @branchdiff/parser — unified-diff parser
│   └── ui/           # @branchdiff/ui — React Router 7 client
├── scripts/          # root build/dev orchestration
├── docs/
│   ├── OVERVIEW.md
│   ├── PLAN.md
│   └── guideline/    # ← you are here
└── package.json      # @branchdiff/root (private)
```

---

## Prerequisites

- **Node.js 20+** (hard requirement — React Router 7 needs it)
- **pnpm 8+** — `npm install -g pnpm`
- **git**
- macOS / Linux / WSL (the CLI uses POSIX git paths)

Check your versions:

```bash
node --version   # v20.x or newer
pnpm --version   # 8.x or newer
```

If you juggle Node versions, a `.nvmrc` is recommended — the project works on
Node 20 LTS and Node 22.

---

## Clone & install

```bash
git clone https://github.com/Encryptioner/branchdiff.git
cd branchdiff
pnpm install
```

First install triggers a build of `better-sqlite3`'s native addon. If that
fails, run `pnpm rebuild better-sqlite3`.

---

## Build

```bash
pnpm build
```

What this does (in order, from `scripts/build.ts`):

1. `@branchdiff/parser` → `tsc` → `packages/parser/dist`
2. `@branchdiff/git` → `tsc` → `packages/git/dist`
3. `@branchdiff/github` → `tsc` → `packages/github/dist`
4. `@branchdiff/ui` → `react-router build` → `packages/cli/dist/ui/`
   *(the server phase fails under pnpm strict mode — this is expected and
   handled; a static `index.html` is regenerated from the Vite manifest)*
5. `@encryptioner/branchdiff` → `esbuild` bundles everything above into
   `packages/cli/dist/index.js`
6. `README.md` + `LICENSE.md` are copied from the repo root into
   `packages/cli/` so they ship with the npm package

Artifacts:

- `packages/cli/dist/index.js` — the CLI entry (run with `node`)
- `packages/cli/dist/ui/client/` — static assets served by the CLI's HTTP
  server

---

## Run from source

### Without building (fastest iteration)

```bash
pnpm dev
```

This runs `scripts/dev.ts` which uses `tsx` to execute the CLI directly from
TypeScript and watches the UI in dev mode.

### Against a real repo, from the built dist

```bash
pnpm build
cd /path/to/some/repo
node /path/to/branchdiff/packages/cli/dist/index.js main..feature
```

---

## Using your local build in another project

There are three patterns, in increasing order of "feels like a real install".

### 1. Direct invocation (zero setup)

Just run the built binary with `node`:

```bash
cd /path/to/target-repo
node /absolute/path/to/branchdiff/packages/cli/dist/index.js
```

Useful for one-off testing.

### 2. `pnpm link --global` (dev-loop friendly)

Link the CLI globally, then use the `branchdiff` command as if it were
published. Rebuilding the CLI is picked up immediately — no reinstall.

```bash
# inside the branchdiff repo
pnpm build
cd packages/cli
pnpm link --global

# now in any other terminal
branchdiff --version          # runs your local build
```

To unlink:

```bash
cd packages/cli
pnpm unlink --global
```

**npm equivalent:**

```bash
cd packages/cli
npm link                      # registers globally
# in target
npm link @encryptioner/branchdiff
# to undo:
npm unlink -g @encryptioner/branchdiff
```

### 3. `pnpm pack` → install from tarball (closest to real publish)

This simulates exactly what `npm install @encryptioner/branchdiff` will do.
Use it to verify the published package before releasing.

```bash
cd packages/cli
pnpm pack
# produces encryptioner-branchdiff-0.1.0.tgz

# in another project
pnpm add /absolute/path/to/encryptioner-branchdiff-0.1.0.tgz
# or
npm install /absolute/path/to/encryptioner-branchdiff-0.1.0.tgz
```

Tip: run `npm pack --dry-run` first to preview the file list without creating
the tarball.

### 4. `file:` / `link:` protocol in `package.json`

For a project that should always pick up your local branchdiff:

```json
{
  "devDependencies": {
    "@encryptioner/branchdiff": "file:/absolute/path/to/branchdiff/packages/cli"
  }
}
```

`file:` copies on install (stable); `link:` symlinks (picks up rebuilds
without reinstall). Both work with pnpm and npm.

---

## Dev loop

Typical cycle while hacking on the CLI:

```bash
# terminal 1 — watch build
pnpm --filter @encryptioner/branchdiff run dev:watch

# terminal 2 — run against a test repo
cd /some/test/repo
node /path/to/branchdiff/packages/cli/dist/index.js
```

Or, if you've `pnpm link`-ed globally, just `branchdiff` from the test repo.

For UI-only work, `pnpm --filter @branchdiff/ui run dev` gives you the
React Router dev server with hot reload, but you'll need the CLI running
separately to serve the data APIs.

---

## Testing

```bash
pnpm test                     # runs tests in git + parser + ui
pnpm typecheck                # all packages
```

Individual package:

```bash
pnpm --filter @branchdiff/git test
pnpm --filter @branchdiff/git test:watch
```

---

## Releasing to npm

The `release` script handles clean → build → publish:

```bash
# 1. Bump version
#    edit packages/cli/package.json -> "version"
#    edit packages/cli/CHANGELOG.md with release notes

# 2. Commit + tag
git commit -am "chore: release vX.Y.Z"
git tag vX.Y.Z

# 3. Publish
pnpm run release
#    which does:
#    pnpm clean && pnpm build && cd packages/cli && npm publish
```

### First-time publisher setup

```bash
npm login
npm whoami                    # verify

# confirm scope access
npm access list packages @encryptioner
```

The package is published with `publishConfig.access: public` (required for
scoped packages on the free tier).

### Dry run

Always sanity-check before a real publish:

```bash
cd packages/cli
npm pack --dry-run            # lists files that would ship
npm publish --dry-run         # simulates the full publish
```

### After publish

```bash
git push && git push --tags
# optionally create a GitHub release from the tag
```

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

Expected. `scripts/build.ts` catches it and regenerates `index.html` from the
Vite manifest. If you see *other* errors after that message, those are real.

### Native module errors after switching Node versions

```bash
pnpm rebuild
# or specifically:
npm rebuild better-sqlite3 --build-from-source
```

### `pnpm link` didn't take effect

pnpm's global store location varies. Check:

```bash
pnpm root -g
echo $PATH | tr ':' '\n' | grep pnpm
```

Make sure `$(pnpm root -g)/../bin` is on your `PATH`.

### Workspace package imports fail at runtime

Make sure you ran `pnpm build` — the CLI bundles the workspace packages, so
they must be built (or tsx must be running them directly in dev).

---

## See also

- [USAGE.md](./USAGE.md) — end-user install and commands
- [../OVERVIEW.md](../OVERVIEW.md) — architecture
- [../PLAN.md](../PLAN.md) — build plan and phase tracking
- [root CLAUDE.md](../../CLAUDE.md) — AI-assist conventions
