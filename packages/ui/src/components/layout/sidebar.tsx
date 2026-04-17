import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DiffFile } from '@branchdiff/parser';
import { FileTree } from '../tree/file-tree';
import type { FileTreeHandle } from '../tree/file-tree';
import { SidebarIcon } from '../icons/sidebar-icon';
import { SearchIcon } from '../icons/search-icon';
import { XIcon } from '../icons/x-icon';
import { CommentIcon } from '../icons/comment-icon';
import { CollapseAllIcon } from '../icons/collapse-all-icon';
import { ExpandAllIcon } from '../icons/expand-all-icon';
import { ChevronIcon } from '../icons/chevron-icon';
import { BranchCommitList } from './branch-commit-list';
import type { BranchCommit } from '../../lib/api';

const SIDEBAR_MIN_W = 200;
const SIDEBAR_MAX_W = 720;
const SIDEBAR_DEFAULT_W = 288; // was w-72
const SIDEBAR_WIDTH_STORAGE_KEY = 'branchdiff-sidebar-width';

function readStoredWidth(): number {
  if (typeof window === 'undefined') return SIDEBAR_DEFAULT_W;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!raw) return SIDEBAR_DEFAULT_W;
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= SIDEBAR_MIN_W && n <= SIDEBAR_MAX_W) return n;
  } catch {
    // localStorage unavailable
  }
  return SIDEBAR_DEFAULT_W;
}

interface SidebarProps {
  files: DiffFile[];
  activeFile: string | null;
  reviewedFiles: Set<string>;
  commentCountsByFile: Map<string, number>;
  onFileClick: (path: string) => void;
  onCommentedFileClick: (path: string) => void;
  branchCommits?: BranchCommit[];
  b1?: string;
  b2?: string;
}

export function Sidebar(props: SidebarProps) {
  const {
    files,
    activeFile,
    reviewedFiles,
    commentCountsByFile,
    onFileClick,
    onCommentedFileClick,
    branchCommits,
    b1,
    b2,
  } = props;
  const fileTreeRef = useRef<FileTreeHandle>(null);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [commentedFilesOnly, setCommentedFilesOnly] = useState(false);
  const [allExpanded, setAllExpanded] = useState(true);
  const [showCommits, setShowCommits] = useState(() => !!(branchCommits && branchCommits.length > 0));
  const [width, setWidth] = useState<number>(readStoredWidth);
  const widthRef = useRef(width);
  widthRef.current = width;

  const handleResizeStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthRef.current;
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(SIDEBAR_MIN_W, Math.min(SIDEBAR_MAX_W, startW + ev.clientX - startX));
      setWidth(next);
    };
    const onUp = () => {
      try {
        window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(widthRef.current));
      } catch {
        // localStorage unavailable
      }
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleResizeDoubleClick = useCallback(() => {
    setWidth(SIDEBAR_DEFAULT_W);
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(SIDEBAR_DEFAULT_W));
    } catch {
      // localStorage unavailable
    }
  }, []);

  const commentedFileCount = commentCountsByFile.size;
  const commentedFileCountLabel = commentedFileCount > 99 ? '99+' : String(commentedFileCount);
  const countLabel = useMemo(() => {
    if (commentedFilesOnly) {
      return `${commentedFileCount}/${files.length}`;
    }
    if (reviewedFiles.size > 0) {
      return `${reviewedFiles.size}/${files.length}`;
    }
    return `${files.length}`;
  }, [commentedFilesOnly, commentedFileCount, files.length, reviewedFiles.size]);

  useEffect(() => {
    if (commentedFileCount === 0 && commentedFilesOnly) {
      setCommentedFilesOnly(false);
    }
  }, [commentedFileCount, commentedFilesOnly]);

  const handleTreeFileClick = (path: string) => {
    if (commentedFilesOnly && commentCountsByFile.has(path)) {
      onCommentedFileClick(path);
      return;
    }
    onFileClick(path);
  };

  if (collapsed) {
    return (
      <div className="w-10 min-w-10 shrink-0 border-r border-border bg-bg-secondary flex items-start justify-center pt-3">
        <button
          className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-hover cursor-pointer"
          onClick={() => setCollapsed(false)}
          title="Show sidebar"
        >
          <SidebarIcon className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <>
    <aside
      style={{ width }}
      className="shrink-0 border-r border-border bg-bg-secondary flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-xs font-medium text-text-secondary flex items-center gap-2 uppercase tracking-wider">
          Files
          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 bg-bg-tertiary rounded-full text-[10px] font-semibold text-text-muted">
            {countLabel}
          </span>
        </span>
        <div className="flex items-center gap-0.5">
          <button
            className="p-1 rounded-md text-text-muted hover:text-text hover:bg-hover cursor-pointer"
            onClick={() => {
              if (allExpanded) {
                fileTreeRef.current?.collapseAll();
              } else {
                fileTreeRef.current?.expandAll();
              }
            }}
            title={allExpanded ? 'Collapse all' : 'Expand all'}
          >
            {allExpanded ? (
              <CollapseAllIcon className="w-3.5 h-3.5" />
            ) : (
              <ExpandAllIcon className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            className="p-1 rounded-md text-text-muted hover:text-text hover:bg-hover cursor-pointer"
            onClick={() => setCollapsed(true)}
            title="Hide sidebar"
          >
            <SidebarIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
          <input
            className="w-full h-8 pl-7 pr-7 border border-border rounded-md bg-bg text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 placeholder:text-text-muted"
            type="text"
            placeholder="Filter files..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text cursor-pointer"
              onClick={() => setSearch('')}
            >
              <XIcon className="w-3 h-3" />
            </button>
          )}
        </div>
        {commentedFileCount > 0 && (
          <button
            className={`inline-flex items-center gap-1.5 shrink-0 h-8 px-2 rounded-md border transition-colors cursor-pointer ${
              commentedFilesOnly
                ? 'border-accent bg-accent/8 text-accent'
                : 'border-border bg-bg hover:bg-hover text-text-secondary hover:text-text'
            }`}
            onClick={() => setCommentedFilesOnly((prev) => !prev)}
            title={commentedFilesOnly ? 'Show all files' : 'Show only files with open comments'}
            aria-pressed={commentedFilesOnly}
            aria-label={`${commentedFilesOnly ? 'Show all files' : 'Show only files with open comments'} (${commentedFileCountLabel} files)`}
          >
            <CommentIcon className="w-3.5 h-3.5" />
            <span
              className={`inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-semibold leading-none tabular-nums ${
                commentedFilesOnly
                  ? 'bg-bg text-accent'
                  : 'bg-bg-tertiary text-text-secondary'
              }`}
            >
              {commentedFileCountLabel}
            </span>
          </button>
        )}
      </div>
      {branchCommits && branchCommits.length > 0 && (
        <div className="border-b border-border">
          <button
            className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-text-secondary uppercase tracking-wider hover:bg-hover transition-colors cursor-pointer"
            onClick={() => setShowCommits(!showCommits)}
          >
            <span className="flex items-center gap-2">
              Commits
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 bg-bg-tertiary rounded-full text-[10px] font-semibold text-text-muted">
                {branchCommits.length}
              </span>
            </span>
            <ChevronIcon expanded={showCommits} />
          </button>
          {showCommits && (
            <div className="max-h-64 overflow-y-auto">
              <BranchCommitList commits={branchCommits} b1={b1} b2={b2} />
            </div>
          )}
        </div>
      )}
      <FileTree
        ref={fileTreeRef}
        files={files}
        search={search}
        activeFile={activeFile}
        reviewedFiles={reviewedFiles}
        commentCountsByFile={commentCountsByFile}
        commentedFilesOnly={commentedFilesOnly}
        onFileClick={handleTreeFileClick}
        onExpandedStateChange={setAllExpanded}
      />
    </aside>
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar (drag, double-click to reset)"
      className="group relative w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-accent/40 active:bg-accent transition-colors select-none"
      onMouseDown={handleResizeStart}
      onDoubleClick={handleResizeDoubleClick}
      title="Drag to resize · double-click to reset"
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
    </>
  );
}
