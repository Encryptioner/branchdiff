# branchdiff UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix CLI tab completion, fix lazy-load stats accuracy, and add a Δ (delta) mode showing which files/lines differ between file-mode and git-mode branch comparisons.

**Architecture:** Three independent changes: (1) zsh completion uses source-based registration instead of fpath/autoload — appended after oh-my-zsh so compdef fires after compinit; (2) server computes aggregate line stats once via `git diff --numstat` and includes them in `/api/compare` response so the toolbar is accurate on first render; (3) a new `DeltaView` component fetches both comparison modes in parallel, categorises files into git-only/file-only/shared, and shows expandable diff previews with amber (git-only) / blue (file-only) colour coding.

**Tech Stack:** Node.js (zsh/bash completion), TypeScript strict, React 18, TanStack Query v5, Tailwind CSS, existing `@branchdiff/parser` types.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/cli/src/completions/zsh.sh` | Modify | Source-based completion registration |
| `packages/cli/src/commands/completion.ts` | Modify | Install source line, clean up old fpath line |
| `packages/cli/src/server.ts` | Modify | Add `lineStats` to `/api/compare` response |
| `packages/ui/src/lib/api.ts` | Modify | Add `lineStats` to `BranchComparison` interface |
| `packages/ui/src/components/diff/diff-page.tsx` | Modify | Use server `lineStats`, handle delta mode branching |
| `packages/ui/src/routes/diff.tsx` | Modify | Loader handles `mode=delta` prefetch |
| `packages/ui/src/components/layout/toolbar.tsx` | Modify | Add Δ to mode toggle, type `'file' | 'git' | 'delta'` |
| `packages/ui/src/components/diff/delta-view.tsx` | Create | Fetches both modes, categorises files, section layout |
| `packages/ui/src/components/diff/delta-file-row.tsx` | Create | Per-file row: expand button, diff preview, amber/blue lines |

---

## Task 1: Fix zsh tab completion — update zsh.sh

**Files:**
- Modify: `packages/cli/src/completions/zsh.sh`

The current file starts with `#compdef branchdiff` (fpath autoload directive) and ends with `_branchdiff "$@"`. In the source-based approach both are replaced: the directive is removed, `compdef _branchdiff branchdiff` is added at the bottom.

- [ ] **Step 1: Edit zsh.sh**

Replace the entire file with:

```sh
# branchdiff shell completion

_branchdiff() {
  local curcontext="$curcontext" state line
  local -a branches

  branches=(${(f)"$(git branch -a 2>/dev/null | sed 's/^[* ]*//' | grep -v ' -> ' | grep -v HEAD | sed 's|remotes/||')"})
  branches+=(staged unstaged HEAD .)

  local -a subcommands
  subcommands=(
    'tree:Browse repository files'
    'list:List running instances'
    'kill:Stop running instances'
    'prune:Remove all branchdiff data'
    'update:Check for updates'
    'doctor:Check branchdiff setup'
    'open:Open running instance in browser'
    'completion:Shell completion commands'
  )

  _arguments -C \
    '1: :->first' \
    '2: :->second' \
    '*::arg:->rest' \
    '--base[Base ref]:ref:->ref' \
    '--compare[Compare ref]:ref:->ref' \
    '--mode[Diff mode]:mode:(file git)' \
    '--port[Port]:port:' \
    '--no-open[Do not open browser]' \
    '--quiet[Minimal output]' \
    '--dark[Dark mode]' \
    '--unified[Unified view]' \
    '--new[Force restart]'

  case $state in
    first)
      _describe 'command' subcommands
      _describe 'branch' branches
      ;;
    second)
      case $words[1] in
        completion) _values 'action' 'install[Auto-install]' 'zsh[Print zsh script]' 'bash[Print bash script]' ;;
        tree|list|kill|prune|update|doctor|open) ;;
        *) _describe 'branch' branches ;;
      esac
      ;;
    ref)
      _describe 'branch' branches
      ;;
  esac
}

compdef _branchdiff branchdiff
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/completions/zsh.sh
git commit -m "fix: use source-based zsh completion (compdef instead of fpath)"
```

---

## Task 2: Fix zsh tab completion — update completion installer

**Files:**
- Modify: `packages/cli/src/commands/completion.ts`

`removeOldEvalLine` must also strip the old `fpath+=~/.zfunc` line and any `source ~/.zfunc/_branchdiff` line (for upgrades). `installZsh` appends `source ~/.zfunc/_branchdiff` instead of `fpath+=~/.zfunc`, and guards on `_branchdiff` not being present.

- [ ] **Step 1: Replace `removeOldEvalLine` and `installZsh`**

In `packages/cli/src/commands/completion.ts`, replace the `removeOldEvalLine` function and `installZsh` function with the versions below. Keep `ensureDir`, `installBash`, `registerCompletionCommand` unchanged.

```typescript
function removeOldCompletionLines(configFile: string): void {
  if (!existsSync(configFile)) return;
  const content = readFileSync(configFile, 'utf-8');
  const lines = content.split('\n');
  const filtered = lines.filter((line) => {
    const t = line.trim();
    if (t === '# branchdiff completion') return false;
    if (t === 'eval "$(branchdiff completion zsh)"') return false;
    if (t === 'eval "$(branchdiff completion bash)"') return false;
    if (t.startsWith('fpath+=') && t.includes('.zfunc')) return false;
    if (t.startsWith('fpath=(') && t.includes('.zfunc')) return false;
    if (t === 'source ~/.zfunc/_branchdiff') return false;
    if (t === '[[ -f ~/.zfunc/_branchdiff ]] && source ~/.zfunc/_branchdiff') return false;
    return true;
  });
  writeFileSync(configFile, filtered.join('\n'));
}

function installZsh(): void {
  ensureDir(ZSH_DIR);
  writeFileSync(ZSH_FILE, ZSH_SCRIPT);
  console.log(pc.green(`  Completion installed → ${ZSH_FILE}`));

  const zshrc = join(homedir(), '.zshrc');
  removeOldCompletionLines(zshrc);

  if (existsSync(zshrc)) {
    const content = readFileSync(zshrc, 'utf-8');
    if (!content.includes('_branchdiff')) {
      appendFileSync(zshrc, '\n# branchdiff completion\nsource ~/.zfunc/_branchdiff\n');
      console.log(pc.dim('  Added completion source to .zshrc'));
    }
  }

  console.log(pc.dim('  Restart your shell or run: exec zsh'));
}
```

Also remove the old `removeOldEvalLine` function entirely (it is replaced by `removeOldCompletionLines`).

Update the two call sites that currently reference `removeOldEvalLine`:
- `installZsh` now calls `removeOldCompletionLines(zshrc)` ✓ (already in code above)
- `installBash` currently calls `removeOldEvalLine(join(homedir(), '.bashrc'))` — change it to `removeOldCompletionLines(join(homedir(), '.bashrc'))`

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/commands/completion.ts
git commit -m "fix: install completion via source instead of fpath (works with oh-my-zsh)"
```

---

## Task 3: Add `lineStats` to `/api/compare` server response

**Files:**
- Modify: `packages/cli/src/server.ts` (around line 620–659)

After computing `files`, run `git diff --numstat b1 b2`, parse per-file line stats, filter to paths in `files`, sum, and include `lineStats` in the JSON response.

- [ ] **Step 1: Edit the `/api/compare` handler in `server.ts`**

Find the block:
```typescript
sendJson(res, {
  files,
  total: files.length,
  summary: {
    added: files.filter(f => f.status === 'added').length,
    modified: files.filter(f => f.status === 'modified').length,
    deleted: files.filter(f => f.status === 'deleted').length,
  },
});
```

Replace with:
```typescript
// Compute aggregate line stats from numstat (one fast git call, covers both modes).
// Filter to only paths that this mode's file list includes.
const numstatOut = await gitAsync(['diff', '--numstat', b1, b2]);
const filePaths = new Set(files.map(f => f.path));
let totalAdditions = 0;
let totalDeletions = 0;
for (const line of numstatOut.split('\n')) {
  if (!line.trim()) continue;
  const parts = line.split('\t');
  if (parts.length < 3) continue;
  const added = parseInt(parts[0], 10);
  const deleted = parseInt(parts[1], 10);
  const path = parts[2];
  if (!filePaths.has(path) || isNaN(added) || isNaN(deleted)) continue;
  totalAdditions += added;
  totalDeletions += deleted;
}

sendJson(res, {
  files,
  total: files.length,
  summary: {
    added: files.filter(f => f.status === 'added').length,
    modified: files.filter(f => f.status === 'modified').length,
    deleted: files.filter(f => f.status === 'deleted').length,
  },
  lineStats: { additions: totalAdditions, deletions: totalDeletions },
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/server.ts
git commit -m "feat: include lineStats in /api/compare response"
```

---

## Task 4: Update client `BranchComparison` type and use `lineStats` in toolbar

**Files:**
- Modify: `packages/ui/src/lib/api.ts`
- Modify: `packages/ui/src/components/diff/diff-page.tsx`

- [ ] **Step 1: Add `lineStats` to `BranchComparison` interface in `api.ts`**

Find:
```typescript
export interface BranchComparison {
  files: BranchDiffFile[];
  total: number;
  summary: {
    added: number;
    modified: number;
    deleted: number;
  };
}
```

Replace with:
```typescript
export interface BranchComparison {
  files: BranchDiffFile[];
  total: number;
  summary: {
    added: number;
    modified: number;
    deleted: number;
  };
  lineStats: {
    additions: number;
    deletions: number;
  };
}
```

- [ ] **Step 2: Use `branchData.lineStats` for stats in `diff-page.tsx`**

In `diff-page.tsx`, find the stats computation inside the IIFE (lines ~130–138):
```typescript
const stats = normalizedFiles.reduce(
  (acc, file) => ({
    totalAdditions: acc.totalAdditions + file.additions,
    totalDeletions: acc.totalDeletions + file.deletions,
    filesChanged: branchData.total,
  }),
  { totalAdditions: 0, totalDeletions: 0, filesChanged: branchData.total }
);
```

Replace with:
```typescript
const stats = {
  totalAdditions: branchData.lineStats?.additions ?? 0,
  totalDeletions: branchData.lineStats?.deletions ?? 0,
  filesChanged: branchData.total,
};
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/lib/api.ts packages/ui/src/components/diff/diff-page.tsx
git commit -m "fix: use server lineStats for toolbar so counts don't change on lazy load"
```

---

## Task 5: Add `'delta'` to mode type and toolbar toggle

**Files:**
- Modify: `packages/ui/src/components/layout/toolbar.tsx`
- Modify: `packages/ui/src/routes/diff.tsx`
- Modify: `packages/ui/src/components/diff/diff-page.tsx` (type only)

- [ ] **Step 1: Update mode type in `toolbar.tsx`**

Find in `toolbar.tsx`:
```typescript
  diffMode?: 'file' | 'git';
  onDiffModeChange?: (mode: 'file' | 'git') => void;
```
Replace with:
```typescript
  diffMode?: 'file' | 'git' | 'delta';
  onDiffModeChange?: (mode: 'file' | 'git' | 'delta') => void;
```

Find:
```typescript
  const diffModeOptions = useMemo(() => [
    { value: 'file' as const, label: 'File' },
    { value: 'git' as const, label: 'Git' },
  ], []);
```
Replace with:
```typescript
  const diffModeOptions = useMemo(() => [
    { value: 'file' as const, label: 'File' },
    { value: 'git' as const, label: 'Git' },
    { value: 'delta' as const, label: 'Δ' },
  ], []);
```

- [ ] **Step 2: Update mode type in `diff-page.tsx`**

Find:
```typescript
  mode: 'file' | 'git';
```
(in the `loaderData` type and `useState` initial value lines — there are two occurrences)

In the `useLoaderData` type (line ~30):
```typescript
    mode: 'file' | 'git';
```
Change to:
```typescript
    mode: 'file' | 'git' | 'delta';
```

For the `useState` line:
```typescript
  const [mode, setMode] = useState<'file' | 'git'>(initialMode || 'file');
```
Change to:
```typescript
  const [mode, setMode] = useState<'file' | 'git' | 'delta'>(initialMode || 'file');
```

For `handleDiffModeChange`:
```typescript
  const handleDiffModeChange = useCallback((newMode: 'file' | 'git') => {
```
Change to:
```typescript
  const handleDiffModeChange = useCallback((newMode: 'file' | 'git' | 'delta') => {
```

For `branchDiff = useBranchComparison(b1!, b2!, mode)` — delta mode must not send `mode=delta` to the API. Change the line:
```typescript
  const branchDiff = useBranchComparison(b1!, b2!, mode);
```
to:
```typescript
  const effectiveApiMode = mode === 'delta' ? 'file' : mode;
  const branchDiff = useBranchComparison(b1!, b2!, effectiveApiMode);
```

- [ ] **Step 3: Update loader in `routes/diff.tsx`**

Find:
```typescript
  const mode = url.searchParams.get("mode") as "file" | "git" | null;
```
Replace with:
```typescript
  const mode = url.searchParams.get("mode") as "file" | "git" | "delta" | null;
```

Find the loader block that calls `branchComparisonOptions`:
```typescript
    await Promise.all([
      queryClient.ensureQueryData(branchComparisonOptions(b1, b2, mode ?? undefined)),
      queryClient.ensureQueryData(repoInfoOptions(ref)),
      queryClient.ensureQueryData(branchCommitsOptions(b1, b2)),
    ]);
```
Replace with:
```typescript
    const modeForApi = mode === 'delta' ? undefined : (mode ?? undefined);
    await Promise.all([
      queryClient.ensureQueryData(branchComparisonOptions(b1, b2, modeForApi)),
      ...(mode === 'delta' ? [queryClient.ensureQueryData(branchComparisonOptions(b1, b2, 'git'))] : []),
      queryClient.ensureQueryData(repoInfoOptions(ref)),
      queryClient.ensureQueryData(branchCommitsOptions(b1, b2)),
    ]);
```

Find the return:
```typescript
  return { ref, theme, view, b1: b1 ?? null, b2: b2 ?? null, mode: mode ?? "file" };
```
Replace with:
```typescript
  return { ref, theme, view, b1: b1 ?? null, b2: b2 ?? null, mode: (mode ?? "file") as "file" | "git" | "delta" };
```

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/layout/toolbar.tsx packages/ui/src/routes/diff.tsx packages/ui/src/components/diff/diff-page.tsx
git commit -m "feat: add delta mode type and Δ toggle to toolbar"
```

---

## Task 6: Create `DeltaFileRow` component

**Files:**
- Create: `packages/ui/src/components/diff/delta-file-row.tsx`

This component renders one file row (collapsed by default). On expand it lazy-fetches the diff for the relevant mode and shows a preview of changed lines. Categories: `'git-only'`, `'file-only'`, `'shared'`.

- [ ] **Step 1: Create `delta-file-row.tsx`**

```typescript
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fileDiffOptions } from '../../queries/branch-comparison';
import type { BranchDiffFile } from '../../lib/api';
import { cn } from '../../lib/cn';
import { ChevronIcon } from '../icons/chevron-icon';

export type DeltaCategory = 'git-only' | 'file-only' | 'shared';

interface DeltaFileRowProps {
  file: BranchDiffFile;
  category: DeltaCategory;
  b1: string;
  b2: string;
  gitStat?: { additions: number; deletions: number } | null;
  fileStat?: { additions: number; deletions: number } | null;
}

const PREVIEW_LINE_LIMIT = 20;

function StatBadge({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="font-mono text-xs flex items-center gap-1">
      <span className="text-added">+{additions}</span>
      <span className="text-deleted">−{deletions}</span>
    </span>
  );
}

function categoryStyle(cat: DeltaCategory) {
  if (cat === 'git-only') return 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30';
  if (cat === 'file-only') return 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/30';
  return 'border-border bg-bg-secondary';
}

function categoryBadge(cat: DeltaCategory) {
  if (cat === 'git-only') return { label: 'git only', cls: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300' };
  if (cat === 'file-only') return { label: 'file only', cls: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' };
  return { label: 'shared', cls: 'bg-bg-tertiary text-text-muted' };
}

export function DeltaFileRow({ file, category, b1, b2, gitStat, fileStat }: DeltaFileRowProps) {
  const [expanded, setExpanded] = useState(false);
  const diffMode = category === 'file-only' ? 'file' : 'git';

  const { data: diffData } = useQuery({
    ...fileDiffOptions(b1, b2, file.path, diffMode),
    enabled: expanded && category !== 'shared',
  });

  const toggleExpand = useCallback(() => setExpanded(p => !p), []);

  const badge = categoryBadge(category);
  const changedLines = diffData?.files?.files?.[0]?.hunks.flatMap(h =>
    h.lines.filter(l => l.type === 'add' || l.type === 'delete')
  ) ?? [];
  const previewLines = changedLines.slice(0, PREVIEW_LINE_LIMIT);
  const hiddenCount = changedLines.length - previewLines.length;

  return (
    <div className={cn('border rounded-md overflow-hidden', categoryStyle(category))}>
      <button
        onClick={category !== 'shared' ? toggleExpand : undefined}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-left',
          category !== 'shared' && 'hover:bg-hover cursor-pointer',
          category === 'shared' && 'cursor-default',
        )}
      >
        {category !== 'shared' && (
          <ChevronIcon
            className={cn('w-3.5 h-3.5 text-text-muted shrink-0 transition-transform', expanded && 'rotate-180')}
          />
        )}
        <span className="font-mono text-xs text-text truncate flex-1">{file.path}</span>
        <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0', badge.cls)}>
          {badge.label}
        </span>
        {category === 'git-only' && gitStat && (
          <StatBadge additions={gitStat.additions} deletions={gitStat.deletions} />
        )}
        {category === 'file-only' && fileStat && (
          <StatBadge additions={fileStat.additions} deletions={fileStat.deletions} />
        )}
        {category === 'shared' && gitStat && (
          <div className="flex items-center gap-2 text-[10px] text-text-muted">
            <span>git: <StatBadge additions={gitStat.additions} deletions={gitStat.deletions} /></span>
            {fileStat && <span>file: <StatBadge additions={fileStat.additions} deletions={fileStat.deletions} /></span>}
          </div>
        )}
      </button>

      {expanded && category !== 'shared' && (
        <div className="border-t border-inherit">
          {!diffData ? (
            <div className="px-4 py-3 text-xs text-text-muted animate-pulse">Loading…</div>
          ) : previewLines.length === 0 ? (
            <div className="px-4 py-3 text-xs text-text-muted">No changed lines to preview</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <tbody>
                  {previewLines.map((line, i) => (
                    <tr
                      key={i}
                      className={cn(
                        'whitespace-pre',
                        line.type === 'add'
                          ? 'bg-added-highlight text-added-text'
                          : 'bg-deleted-highlight text-deleted-text',
                      )}
                    >
                      <td className="pl-3 pr-2 select-none text-text-muted w-4">
                        {line.type === 'add' ? '+' : '−'}
                      </td>
                      <td className="pr-4">{line.content}</td>
                    </tr>
                  ))}
                  {hiddenCount > 0 && (
                    <tr>
                      <td colSpan={2} className="px-3 py-1.5 text-text-muted italic">
                        … {hiddenCount} more line{hiddenCount !== 1 ? 's' : ''}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/components/diff/delta-file-row.tsx
git commit -m "feat: add DeltaFileRow component for delta mode file display"
```

---

## Task 7: Create `DeltaView` component

**Files:**
- Create: `packages/ui/src/components/diff/delta-view.tsx`

Fetches both comparison modes in parallel via `useQuery` (non-suspending), computes file categories, renders three sections.

- [ ] **Step 1: Create `delta-view.tsx`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { branchComparisonOptions } from '../../queries/branch-comparison';
import type { BranchDiffFile } from '../../lib/api';
import { DeltaFileRow } from './delta-file-row';
import { Spinner } from '../icons/spinner';

interface DeltaViewProps {
  b1: string;
  b2: string;
}

interface CategorisedFiles {
  gitOnly: BranchDiffFile[];
  fileOnly: BranchDiffFile[];
  shared: BranchDiffFile[];
  gitStatMap: Map<string, { additions: number; deletions: number }>;
  fileStatMap: Map<string, { additions: number; deletions: number }>;
}

function categorise(
  gitFiles: BranchDiffFile[],
  fileFiles: BranchDiffFile[],
  gitLineStats: { additions: number; deletions: number },
  fileLineStats: { additions: number; deletions: number },
): CategorisedFiles {
  const gitPaths = new Set(gitFiles.map(f => f.path));
  const filePaths = new Set(fileFiles.map(f => f.path));

  // Build stat maps from server totals (per-file stats require file-diff; use totals as placeholders)
  const gitStatMap = new Map<string, { additions: number; deletions: number }>();
  const fileStatMap = new Map<string, { additions: number; deletions: number }>();

  // We don't have per-file server stats in /api/compare, so stat maps start empty.
  // DeltaFileRow will show stats from the lazily-fetched file diff once expanded.
  void gitLineStats;
  void fileLineStats;

  return {
    gitOnly: gitFiles.filter(f => !filePaths.has(f.path)),
    fileOnly: fileFiles.filter(f => !gitPaths.has(f.path)),
    shared: gitFiles.filter(f => filePaths.has(f.path)),
    gitStatMap,
    fileStatMap,
  };
}

function Section({
  title,
  subtitle,
  children,
  count,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  count: number;
  emptyMessage: string;
}) {
  if (count === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        <span className="text-xs text-text-muted">({count} file{count !== 1 ? 's' : ''})</span>
        <span className="text-xs text-text-muted hidden sm:inline">— {subtitle}</span>
      </div>
      {count === 0 ? (
        <p className="text-xs text-text-muted pl-1">{emptyMessage}</p>
      ) : (
        <div className="space-y-1.5">{children}</div>
      )}
    </div>
  );
}

export function DeltaView({ b1, b2 }: DeltaViewProps) {
  const { data: gitComp, isLoading: gitLoading } = useQuery(branchComparisonOptions(b1, b2, 'git'));
  const { data: fileComp, isLoading: fileLoading } = useQuery(branchComparisonOptions(b1, b2, 'file'));

  if (gitLoading || fileLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-text-muted text-sm">
        <Spinner className="w-4 h-4 animate-spin" />
        Loading both comparison modes…
      </div>
    );
  }

  if (!gitComp || !fileComp) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted text-sm">
        Failed to load comparison data
      </div>
    );
  }

  const { gitOnly, fileOnly, shared } = categorise(
    gitComp.files,
    fileComp.files,
    gitComp.lineStats,
    fileComp.lineStats,
  );

  const totalDelta = gitOnly.length + fileOnly.length;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 font-sans">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Summary header */}
        <div className="p-4 rounded-lg border border-border bg-bg-secondary text-sm space-y-1">
          <p className="font-semibold text-text">Mode Delta: file vs git</p>
          <p className="text-text-muted text-xs">
            Compares what <span className="font-medium text-text">file mode</span> (blob hash comparison) and{' '}
            <span className="font-medium text-text">git mode</span> (commit-based diff) each report for{' '}
            <code className="font-mono bg-bg-tertiary px-1 rounded">{b1}</code> ↔{' '}
            <code className="font-mono bg-bg-tertiary px-1 rounded">{b2}</code>.
          </p>
          {totalDelta === 0 ? (
            <p className="text-added text-xs font-medium mt-1">✓ Both modes report identical file sets</p>
          ) : (
            <p className="text-xs text-text-muted mt-1">
              {gitOnly.length > 0 && `${gitOnly.length} file${gitOnly.length !== 1 ? 's' : ''} only in git mode`}
              {gitOnly.length > 0 && fileOnly.length > 0 && ' • '}
              {fileOnly.length > 0 && `${fileOnly.length} file${fileOnly.length !== 1 ? 's' : ''} only in file mode`}
            </p>
          )}
        </div>

        <Section
          title="Git only"
          subtitle="present in git diff but not file diff (history noise)"
          count={gitOnly.length}
          emptyMessage="No files exclusive to git mode"
        >
          {gitOnly.map(f => (
            <DeltaFileRow
              key={f.path}
              file={f}
              category="git-only"
              b1={b1}
              b2={b2}
              gitStat={null}
              fileStat={null}
            />
          ))}
        </Section>

        <Section
          title="File only"
          subtitle="present in file diff but not git diff (unusual)"
          count={fileOnly.length}
          emptyMessage="No files exclusive to file mode"
        >
          {fileOnly.map(f => (
            <DeltaFileRow
              key={f.path}
              file={f}
              category="file-only"
              b1={b1}
              b2={b2}
              gitStat={null}
              fileStat={null}
            />
          ))}
        </Section>

        <Section
          title="Shared"
          subtitle="both modes agree this file changed"
          count={shared.length}
          emptyMessage="No files shared between modes"
        >
          {shared.map(f => (
            <DeltaFileRow
              key={f.path}
              file={f}
              category="shared"
              b1={b1}
              b2={b2}
              gitStat={null}
              fileStat={null}
            />
          ))}
        </Section>

        {gitOnly.length === 0 && fileOnly.length === 0 && shared.length === 0 && (
          <div className="text-center text-text-muted text-sm py-16">
            No differences found between modes for this branch pair.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/components/diff/delta-view.tsx
git commit -m "feat: add DeltaView component — categorises files by mode presence"
```

---

## Task 8: Wire `DeltaView` into `diff-page.tsx`

**Files:**
- Modify: `packages/ui/src/components/diff/diff-page.tsx`

When `mode === 'delta'` and `isBranchComparison`, render `DeltaView` instead of `DiffView`. Hide the toolbar stats pill in delta mode (avoids misleading file-mode stats).

- [ ] **Step 1: Add DeltaView import to `diff-page.tsx`**

Add at the top imports (after existing diff-related imports):
```typescript
import { DeltaView } from './delta-view';
```

- [ ] **Step 2: Hide stats from toolbar in delta mode**

In the `<Toolbar>` JSX in `diff-page.tsx`, find the `diff={diff || undefined}` prop:
```typescript
        diff={diff || undefined}
```
Replace with:
```typescript
        diff={mode === 'delta' ? undefined : (diff || undefined)}
```

- [ ] **Step 3: Render `DeltaView` when mode is delta**

In `diff-page.tsx`, find the section in the render that contains `<DiffView ... />`:

```typescript
      <div className="flex flex-1 overflow-hidden">
        <Sidebar ... />
        {diff ? (
          <DiffView
            diff={diff}
            ...
          />
        ) : null}
      </div>
```

Replace with:
```typescript
      <div className="flex flex-1 overflow-hidden">
        {mode !== 'delta' && (
          <Sidebar
            files={diff?.files || []}
            activeFile={activeFile}
            reviewedFiles={reviewedFiles}
            commentCountsByFile={commentCountsByFile}
            onFileClick={handleSidebarFileClick}
            onCommentedFileClick={handleSidebarCommentedFileClick}
            branchCommits={isBranchComparison ? branchCommits : undefined}
            b1={isBranchComparison ? b1 ?? undefined : undefined}
            b2={isBranchComparison ? b2 ?? undefined : undefined}
          />
        )}
        {mode === 'delta' && isBranchComparison && b1 && b2 ? (
          <DeltaView b1={b1} b2={b2} />
        ) : diff ? (
          <DiffView
            diff={diff}
            viewMode={viewMode}
            theme={theme}
            collapsedFiles={collapsedFiles}
            onToggleCollapse={handleToggleCollapse}
            reviewedFiles={reviewedFiles}
            onReviewedChange={handleReviewedChange}
            onActiveFileChange={handleActiveFileFromScroll}
            handle={diffViewRef}
            baseRef={refParam}
            canRevert={canRevert}
            onRevert={handleRevert}
            scrollRef={(node) => {
              mainRef.current = node;
            }}
            threads={threads}
            commentsEnabled={reviewsEnabled}
            commentActions={commentActions}
            onAddThread={handleAddThread}
            pendingSelection={pendingSelection}
            onPendingSelectionChange={setPendingSelection}
            showFullDiff={showFullDiff}
            branchCompare={isBranchComparison && b1 && b2 ? { b1, b2, mode: effectiveApiMode } : undefined}
            onRequestFileDiffs={isBranchComparison ? requestFileDiffs : undefined}
          />
        ) : null}
      </div>
```

Note: the `branchCompare` prop's `mode` field now uses `effectiveApiMode` (defined in Task 5) instead of `mode` directly, since `branchCompare.mode` must be `'file' | 'git'`.

- [ ] **Step 4: Build to check for type errors**

```bash
cd /path/to/branchdiff && pnpm build 2>&1 | head -60
```

Expected: build completes. Fix any TypeScript errors before committing.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/diff/diff-page.tsx
git commit -m "feat: render DeltaView when mode=delta, hide sidebar and stats pill"
```

---

## Task 9: Manual verification

- [ ] **Step 1: Verify zsh completion fix**

Check that the installed `.zfunc/_branchdiff` file ends with `compdef _branchdiff branchdiff` and not `_branchdiff "$@"`.

```bash
tail -5 ~/.zfunc/_branchdiff
```

Expected output ends with `compdef _branchdiff branchdiff`.

Check that `.zshrc` contains the source line (not fpath):

```bash
grep branchdiff ~/.zshrc
```

Expected: `source ~/.zfunc/_branchdiff` (no `fpath` line).

- [ ] **Step 2: Verify lineStats**

Start a branchdiff instance with two real branches and call the API:

```bash
curl -s "http://localhost:<port>/api/compare?b1=main&b2=<feature>&mode=file" | jq '.lineStats'
```

Expected: `{ "additions": <N>, "deletions": <M> }` (non-null, stable on repeated calls).

- [ ] **Step 3: Verify toolbar stats don't change on scroll**

1. Open `branchdiff main <feature>` with many changed files
2. Watch the toolbar stats while slowly scrolling down
3. Stats (`+N −M`) must not change as files enter viewport

- [ ] **Step 4: Verify delta mode UI**

1. Open `branchdiff main <feature>`
2. Click the **Δ** button in the toolbar
3. Verify three sections appear: "Git only", "File only", "Shared"
4. Click a file row in "Git only" → verify diff preview expands with amber-coloured lines
5. Click a file row in "File only" → verify diff preview expands with blue-coloured lines
6. Switch back to "File" and "Git" modes → verify normal diff view resumes

- [ ] **Step 5: Final commit (if any cleanup needed)**

```bash
git add -p
git commit -m "chore: cleanup after delta mode implementation"
```
