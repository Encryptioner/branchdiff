# branchdiff

Visual file-level git branch diff in your browser. Inspired by [Diffity](https://github.com/kamranahmedse/diffity).

## The problem it solves

`git diff branch1..branch2` compares **commit history divergence**, not file content.
If two branches reached the same file state via different commits, `git diff` shows noise. `branchdiff --mode file` compares what the files actually *are* at each branch tip — content truth, not history.

```
main:  A → B → C → D   (file.js = "hello world")
feat:  A → X → Y       (file.js = "hello world")

git diff main..feat  →  shows diff  (different commit paths)
branchdiff main feat →  no diff     (same content)
```

## Install

```bash
cd branchdiff
pnpm install
pnpm link --global   # makes `branchdiff` available globally
```

## Usage

```bash
# Interactive — Tab to complete branch names
branchdiff

# Direct
branchdiff main feat

# Git diff mode (commit-level, classic behavior)
branchdiff main feat --mode git

# Custom port
branchdiff main feat --port 3456

# Don't auto-open browser
branchdiff main feat --no-open
```

## Features

- **File-level diff** (default): compares actual file content at each branch tip, ignoring commit history
- **Git diff mode** (`--mode git`): classic commit-history-aware diff
- **Tab completion**: type branch name prefix, press Tab to complete
- **Browser UI**: file list with status indicators, side-by-side and unified diff views
- **Per-file mode toggle**: switch between file/git diff per file in the UI
- **Search**: filter the file list by path
- **Fast**: uses git blob hashes to skip identical files — only fetches content for changed files

## How it works

```
git ls-tree -r branch   →  blob hash per file (fast equality check)
git show branch:path    →  file content at branch tip (no checkout needed)
diff(content_a, b)      →  unified patch → diff2html renders in browser
```

Gitignored files are excluded by default (git ls-tree only returns tracked files).

## Limitations

- Binary files: shown as "binary file, no text diff"
- Rename detection: not yet implemented (shows as delete + add)
- Working tree comparison: not yet supported (branch-to-branch only)

## Comparison with similar tools

| Tool | Browser | File-level diff | Tab completion | All files |
|------|---------|----------------|----------------|-----------|
| `git diff` | No | No | No | Yes |
| `diff2html-cli` | Yes | No | No | Yes |
| VSCode Compare | Yes | Yes | No | One at a time |
| **branchdiff** | Yes | Yes | Yes | Yes |
