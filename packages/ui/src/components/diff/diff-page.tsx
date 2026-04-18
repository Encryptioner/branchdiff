import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useLoaderData } from 'react-router';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useDiff } from '../../hooks/use-diff';
import { useBranchComparison } from '../../hooks/use-branch-comparison';
import { branchCommitsOptions, fileDiffOptions } from '../../queries/branch-comparison';
import { useInfo } from '../../hooks/use-info';
import { useTheme } from '../../hooks/use-theme';
import { useKeyboard } from '../../hooks/use-keyboard';
import { useReviewThreads } from '../../hooks/use-review-threads';
import { useCommentActions } from '../../hooks/use-comment-actions';
import { Toolbar } from '../layout/toolbar';
import { DiffView, type DiffViewHandle } from './diff-view';
import { Sidebar } from '../layout/sidebar';
import { ShortcutModal } from '../layout/shortcut-modal';
import { StaleDiffBanner } from '../layout/stale-diff-banner';
import { MergeConflictBanner } from '../layout/merge-conflict-banner';
import { CheckCircleIcon } from '../icons/check-circle-icon';
import { PageLoader } from '../layout/skeleton';
import { useDiffStaleness } from '../../hooks/use-diff-staleness';
import { type ViewMode, getFilePath, getAutoCollapsedPaths } from '../../lib/diff-utils';
import { buildFirstOpenThreadByFile, buildThreadCountsByFile } from '../../lib/comment-navigation';
import { getHunkHeaders, scrollToElement } from '../../lib/dom-utils';
import { fetchGitHubDetails, type GitHubDetails } from '../../lib/api';
import { DeltaView } from './delta-view';
import type { LineSelection } from '../comments/types';
import type { DiffFile } from '@branchdiff/parser';

export function DiffPage() {
  const loaderData = useLoaderData<{
    ref: string;
    theme: 'light' | 'dark' | null;
    view: 'split' | 'unified' | null;
    b1: string | null;
    b2: string | null;
    mode: 'file' | 'git' | 'delta';
  }>();

  const { ref: refParam, theme: initialTheme, view: initialViewMode, b1, b2, mode: initialMode } = loaderData;
  const isBranchComparison = !!(b1 && b2);

  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode || 'split');
  const [hideWhitespace, setHideWhitespace] = useState(false);
  const [showFullDiff, setShowFullDiff] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Mode as local state so switching is instant — URL synced via replaceState to avoid loader re-run
  const [mode, setMode] = useState<'file' | 'git' | 'delta'>(initialMode || 'file');
  const { theme, toggleTheme } = useTheme(initialTheme);
  const queryClient = useQueryClient();

  const handleDiffModeChange = useCallback((newMode: 'file' | 'git' | 'delta') => {
    setMode(newMode);
    const params = new URLSearchParams(window.location.search);
    params.set('mode', newMode);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, []);

  // Regular diff or branch comparison mode
  const regularDiff = useDiff(hideWhitespace, refParam);
  // 'delta' is UI-only — map to 'file' for the API. Must match the key used in the loader's prefetchQuery.
  const effectiveApiMode = mode === 'delta' ? 'file' : mode;
  const branchDiff = useBranchComparison(b1!, b2!, effectiveApiMode as 'file' | 'git');

  const { data: info } = useInfo(refParam);

  // Branch commits (only fetched in branch comparison mode)
  const { data: branchCommitsData } = useQuery({
    ...branchCommitsOptions(b1 ?? '', b2 ?? ''),
    enabled: isBranchComparison,
  });
  const branchCommits = branchCommitsData?.commits;

  // Per-file diff data (populated lazily as files come into viewport)
  const [fileDiffs, setFileDiffs] = useState<Map<string, DiffFile>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  // Incremented on mode/branch change so stale in-flight callbacks are ignored
  const generationRef = useRef(0);

  // Reset cache when branch pair or mode changes
  useEffect(() => {
    generationRef.current++;
    setFileDiffs(new Map());
    inFlightRef.current = new Set();
  }, [b1, b2, mode]);

  const requestFileDiffs = useCallback((paths: string[]) => {
    if (!isBranchComparison || !b1 || !b2 || !branchDiff.data) return;
    const gen = generationRef.current;
    const oldPathByNew = new Map(
      branchDiff.data.files
        .filter(f => f.oldPath)
        .map(f => [f.path, f.oldPath!]),
    );
    for (const path of paths) {
      if (fileDiffs.has(path) || inFlightRef.current.has(path)) continue;
      inFlightRef.current.add(path);
      const oldFile = oldPathByNew.get(path);
      queryClient
        .ensureQueryData(fileDiffOptions(b1, b2, path, mode, oldFile))
        .then(fileDiff => {
          if (generationRef.current !== gen) return;
          const parsed = fileDiff.files?.files?.[0];
          if (!parsed) return;
          setFileDiffs(prev => {
            if (prev.has(path)) return prev;
            const next = new Map(prev);
            next.set(path, parsed);
            return next;
          });
        })
        .catch(() => {})
        .finally(() => {
          inFlightRef.current.delete(path);
        });
    }
  }, [isBranchComparison, b1, b2, mode, queryClient, fileDiffs, branchDiff.data]);

  // Warm prefetch: first 10 files so the initial viewport loads instantly
  useEffect(() => {
    if (!isBranchComparison || !branchDiff.data) return;
    const initial = branchDiff.data.files.slice(0, 10).map(f => f.path);
    requestFileDiffs(initial);
    // requestFileDiffs intentionally omitted — it's stable enough and we only want to fire on data change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBranchComparison, branchDiff.data]);

  // Normalize branch comparison data to ParsedDiff-like format
  const diff = isBranchComparison
    ? (() => {
        const { data: branchData, error: branchError } = branchDiff;
        if (branchError || !branchData) return regularDiff.data;

        const normalizedFiles = branchData.files.map(f => {
          const fileDiff = fileDiffs.get(f.path);
          return {
            oldPath: f.status === 'added' ? '/dev/null' : (f.oldPath ?? f.path),
            newPath: f.status === 'deleted' ? '/dev/null' : f.path,
            status: f.status,
            hunks: fileDiff?.hunks || [],
            additions: fileDiff?.additions || 0,
            deletions: fileDiff?.deletions || 0,
            isBinary: fileDiff?.isBinary || false,
            oldFileLineCount: fileDiff?.oldFileLineCount,
          } as DiffFile;
        });

        const stats = {
          totalAdditions: branchData.lineStats?.additions ?? 0,
          totalDeletions: branchData.lineStats?.deletions ?? 0,
          filesChanged: branchData.total,
        };

        return {
          files: normalizedFiles,
          stats,
        };
      })()
    : regularDiff.data;

  const error = isBranchComparison ? branchDiff.error : regularDiff.error;
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const reviewedStorageKey = useMemo(() =>
    isBranchComparison && b1 && b2 ? `branchdiff-reviewed:${b1}:${b2}` : null,
  [isBranchComparison, b1, b2]);
  const [reviewedFiles, setReviewedFiles] = useState<Set<string>>(() => {
    if (!isBranchComparison || !b1 || !b2) return new Set();
    try {
      const raw = window.localStorage.getItem(`branchdiff-reviewed:${b1}:${b2}`);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const manuallyToggledRef = useRef<Set<string>>(new Set());
  const [pendingSelection, setPendingSelection] = useState<LineSelection | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const diffViewRef = useRef<DiffViewHandle>(null);
  const currentFileIdx = useRef(0);
  const initializedDiffRef = useRef<typeof diff>(null);

  useEffect(() => {
    if (!reviewedStorageKey) return;
    try {
      window.localStorage.setItem(reviewedStorageKey, JSON.stringify([...reviewedFiles]));
    } catch {}
  }, [reviewedFiles, reviewedStorageKey]);

  const reviewsEnabled = !!info?.capabilities?.reviews;
  const sessionId = info?.sessionId ?? null;
  const canRevert = !!info?.capabilities?.revert;
  const { isStale, resetStaleness } = useDiffStaleness(refParam, !!info?.capabilities?.staleness);
  const [githubDetails, setGithubDetails] = useState<GitHubDetails | null>(null);

  useEffect(() => {
    const repoName = info?.name || 'branchdiff';
    const stats = diff?.stats;
    const statsStr = stats
      ? ` · ${stats.filesChanged} file${stats.filesChanged !== 1 ? 's' : ''} +${stats.totalAdditions} -${stats.totalDeletions}`
      : '';
    if (isBranchComparison && b1 && b2) {
      document.title = `${b1} \u2194 ${b2}${statsStr} \u2014 ${repoName}`;
    } else if (refParam && refParam !== 'work' && refParam !== '.') {
      document.title = `${refParam}${statsStr} \u2014 ${repoName}`;
    } else {
      document.title = repoName;
    }
  }, [info?.name, isBranchComparison, b1, b2, mode, refParam, diff?.stats]);

  useEffect(() => {
    if (!info?.github) {
      return;
    }
    fetchGitHubDetails()
      .then(data => setGithubDetails(data))
      .catch(() => {});
  }, [info?.github]);

  const { data: serverThreads, isFetched: threadsFetched } = useReviewThreads(reviewsEnabled ? sessionId : null);
  const threads = reviewsEnabled && serverThreads ? serverThreads : [];
  const commentActions = useCommentActions(sessionId, reviewsEnabled);
  const commentCountsByFile = useMemo(() => buildThreadCountsByFile(threads), [threads]);

  const filesWithComments = useMemo(() => {
    return new Set(commentCountsByFile.keys());
  }, [commentCountsByFile]);

  const firstOpenThreadByFile = useMemo(() => {
    const fileOrder = diff?.files.map(file => getFilePath(file)) ?? [];
    return buildFirstOpenThreadByFile(threads, fileOrder);
  }, [diff, threads]);

  const handleAddThread = useCallback((...args: Parameters<typeof commentActions.addThread>) => {
    commentActions.addThread(...args);
    setPendingSelection(null);
  }, [commentActions]);

  useEffect(() => {
    if (!diff || diff === initializedDiffRef.current) {
      return;
    }
    initializedDiffRef.current = diff;

    const autoCollapsed = getAutoCollapsedPaths(diff.files);
    for (const path of filesWithComments) {
      autoCollapsed.delete(path);
    }
    for (const path of manuallyToggledRef.current) {
      if (autoCollapsed.has(path)) {
        autoCollapsed.delete(path);
      } else {
        autoCollapsed.add(path);
      }
    }
    setCollapsedFiles(autoCollapsed);
  }, [diff]);

  useEffect(() => {
    if (filesWithComments.size === 0) {
      return;
    }
    setCollapsedFiles((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const path of filesWithComments) {
        if (next.has(path)) {
          next.delete(path);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [filesWithComments]);

  const handleToggleCollapse = useCallback((path: string) => {
    const toggled = manuallyToggledRef.current;
    if (toggled.has(path)) {
      toggled.delete(path);
    } else {
      toggled.add(path);
    }
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleReviewedChange = useCallback((path: string, reviewed: boolean) => {
    setReviewedFiles((prev) => {
      const next = new Set(prev);
      if (reviewed) {
        next.add(path);
      } else {
        next.delete(path);
      }
      return next;
    });
    if (reviewed) {
      setCollapsedFiles((prev) => {
        const next = new Set(prev);
        next.add(path);
        return next;
      });
    } else {
      setCollapsedFiles((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  }, []);

  const getCurrentFilePath = useCallback((): string | null => {
    if (!diff) {
      return null;
    }
    return getFilePath(diff.files[currentFileIdx.current]);
  }, [diff]);

  const navigateFile = useCallback((direction: number) => {
    if (!diff) {
      return;
    }
    const nextIdx = Math.max(0, Math.min(diff.files.length - 1, currentFileIdx.current + direction));
    currentFileIdx.current = nextIdx;
    const path = getFilePath(diff.files[nextIdx]);
    diffViewRef.current?.scrollToFile(path);
  }, [diff]);

  const navigateHunk = useCallback((direction: number) => {
    const hunks = getHunkHeaders();
    if (hunks.length === 0) {
      return;
    }
    let target = direction > 0 ? hunks[0] : hunks[hunks.length - 1];

    for (let i = 0; i < hunks.length; i++) {
      const rect = hunks[i].getBoundingClientRect();
      if (direction > 0 && rect.top > 100) {
        target = hunks[i];
        break;
      }
      if (direction < 0 && rect.top < -10) {
        target = hunks[i];
      }
    }

    scrollToElement(target);
  }, []);

  useKeyboard({
    onNextFile: () => navigateFile(1),
    onPrevFile: () => navigateFile(-1),
    onNextHunk: () => navigateHunk(1),
    onPrevHunk: () => navigateHunk(-1),
    onToggleCollapse: () => {
      const path = getCurrentFilePath();
      if (path) {
        handleToggleCollapse(path);
      }
    },
    onCollapseAll: () => {
      if (!diff) {
        return;
      }
      const allPaths = diff.files.map((f) => getFilePath(f));
      const anyExpanded = allPaths.some((p) => !collapsedFiles.has(p));
      manuallyToggledRef.current = new Set();
      if (anyExpanded) {
        setCollapsedFiles(new Set(allPaths));
      } else {
        setCollapsedFiles(new Set());
      }
    },
    onToggleReviewed: () => {
      const path = getCurrentFilePath();
      if (!path) {
        return;
      }
      const wasReviewed = reviewedFiles.has(path);
      handleReviewedChange(path, !wasReviewed);
      if (!wasReviewed) {
        navigateFile(1);
      }
    },
    onUnifiedView: () => setViewMode('unified'),
    onSplitView: () => setViewMode('split'),
    onShowHelp: () => setShowHelp(true),
    onFocusSearch: () => {
      const input = document.querySelector(
        'input[placeholder="Filter files..."]',
      ) as HTMLInputElement;
      if (input) {
        input.focus();
      }
    },
    onEscape: () => setShowHelp(false),
  });

  const handleRevert = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['diff'] });
  }, [queryClient]);

  const handleRefreshDiff = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['diff'] });
    resetStaleness();
  }, [queryClient, resetStaleness]);

  const handleSidebarFileClick = useCallback((path: string) => {
    setActiveFile(path);
    diffViewRef.current?.scrollToFile(path);
  }, []);

  const handleScrollToThread = useCallback((threadId: string, filePath: string) => {
    setActiveFile(filePath);
    setCollapsedFiles((prev) => {
      if (!prev.has(filePath)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(filePath);
      return next;
    });
    diffViewRef.current?.scrollToThread(threadId, filePath);
  }, []);

  const handleSidebarCommentedFileClick = useCallback((path: string) => {
    const threadId = firstOpenThreadByFile.get(path);
    if (!threadId) {
      handleSidebarFileClick(path);
      return;
    }
    handleScrollToThread(threadId, path);
  }, [firstOpenThreadByFile, handleSidebarFileClick, handleScrollToThread]);

  const handleActiveFileFromScroll = useCallback((path: string) => {
    setActiveFile(path);
  }, []);

  if (error) {
    return (
      <div className="flex flex-col min-h-screen bg-bg text-text font-sans">
        <div className="flex flex-col items-center justify-center p-12 text-deleted text-center">
          <h2 className="text-xl mb-2">Failed to load diff</h2>
          <p className="text-text-secondary">{error}</p>
        </div>
      </div>
    );
  }

  const threadsLoading = reviewsEnabled && !threadsFetched;
  if (threadsLoading) {
    return <PageLoader />;
  }

  if (diff?.files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-text font-sans gap-2">
        <div className="text-added opacity-40 mb-1">
          <CheckCircleIcon />
        </div>
        <h2 className="text-base font-medium text-text-secondary">No changes found</h2>
        <p className="text-xs text-text-muted">
          {isBranchComparison
            ? `${b1} and ${b2} have identical file content.`
            : 'There are no differences to display.'}
        </p>
        {!isBranchComparison && (
          <div className="mt-4 flex flex-col gap-1.5 items-center">
            <p className="text-xs text-text-muted mb-1">Try one of these</p>
            <code className="inline-block px-3 py-1 bg-bg-secondary border border-border rounded-md font-mono text-xs text-text">
              branchdiff HEAD~1
            </code>
            <code className="inline-block px-3 py-1 bg-bg-secondary border border-border rounded-md font-mono text-xs text-text">
              branchdiff main feature
            </code>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-bg text-text font-sans">
      <Toolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        hideWhitespace={hideWhitespace}
        onHideWhitespaceChange={setHideWhitespace}
        showFullDiff={showFullDiff}
        onShowFullDiffChange={setShowFullDiff}
        theme={theme}
        onToggleTheme={toggleTheme}
        onShowHelp={() => setShowHelp(true)}
        diff={mode === 'delta' ? undefined : (diff || undefined)}
        statsLoading={isBranchComparison && branchDiff.isLoading}
        diffRef={refParam}
        threads={threads}
        onDeleteAllComments={commentActions.deleteAllThreads}
        onScrollToThread={handleScrollToThread}
        repoName={info?.name || null}
        branch={isBranchComparison ? `${b1} ↔ ${b2}` : (info?.branch || null)}
        description={isBranchComparison ? `${mode}-level diff` : (info?.description || null)}
        githubDetails={githubDetails}
        sessionId={sessionId}
        onGitHubPulled={() => queryClient.invalidateQueries({ queryKey: ['threads'] })}
        diffMode={isBranchComparison ? mode : undefined}
        onDiffModeChange={isBranchComparison ? handleDiffModeChange : undefined}
        showFullViewMode={isBranchComparison}
      />
      {isStale && <StaleDiffBanner onRefresh={handleRefreshDiff} />}
      <div className="flex flex-1 overflow-hidden" style={{ flexDirection: 'column' }}>
        {isBranchComparison && b1 && b2 && mode !== 'delta' && (
          <MergeConflictBanner b1={b1} b2={b2} />
        )}
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
      </div>
      {showHelp && <ShortcutModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
