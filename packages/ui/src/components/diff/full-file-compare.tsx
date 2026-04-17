import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DiffHunk, FileStatus } from '@branchdiff/parser';
import { fileDiffOptions } from '../../queries/branch-comparison';
import { useHighlighter, type HighlightedTokens } from '../../hooks/use-highlighter';
import { Spinner } from '../icons/spinner';
import { XIcon } from '../icons/x-icon';
import { SplitViewIcon } from '../icons/split-view-icon';
import { UnifiedViewIcon } from '../icons/unified-view-icon';

type PaneViewMode = 'split' | 'unified';

type OldLineStatus = 'delete' | 'context';
type NewLineStatus = 'add' | 'context';

interface FullFileCompareProps {
  b1: string;
  b2: string;
  filePath: string;
  oldPath: string;
  newPath: string;
  status: FileStatus;
  mode: 'file' | 'git';
  initialViewMode: PaneViewMode;
  theme: 'light' | 'dark';
  onClose: () => void;
}

function buildLineStatus(hunks: DiffHunk[]): {
  oldStatus: Map<number, OldLineStatus>;
  newStatus: Map<number, NewLineStatus>;
} {
  const oldStatus = new Map<number, OldLineStatus>();
  const newStatus = new Map<number, NewLineStatus>();
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'delete' && line.oldLineNumber !== null) {
        oldStatus.set(line.oldLineNumber, 'delete');
      } else if (line.type === 'add' && line.newLineNumber !== null) {
        newStatus.set(line.newLineNumber, 'add');
      } else if (line.type === 'context') {
        if (line.oldLineNumber !== null) oldStatus.set(line.oldLineNumber, 'context');
        if (line.newLineNumber !== null) newStatus.set(line.newLineNumber, 'context');
      }
    }
  }
  return { oldStatus, newStatus };
}

function renderTokens(tokens: { text: string; color?: string }[] | undefined): ReactElement {
  if (!tokens || tokens.length === 0) {
    return <span>&nbsp;</span>;
  }
  return (
    <>
      {tokens.map((t, i) => (
        <span key={i} style={t.color ? { color: t.color } : undefined}>
          {t.text}
        </span>
      ))}
    </>
  );
}

interface PaneProps {
  side: 'old' | 'new';
  lines: string[];
  highlighted: HighlightedTokens[] | null;
  statusMap: Map<number, OldLineStatus | NewLineStatus>;
  onScroll: (scrollTop: number) => void;
  scrollTop: number;
  label: string;
  empty: boolean;
  emptyLabel: string;
}

function FilePane(props: PaneProps) {
  const { side, lines, highlighted, statusMap, onScroll, scrollTop, label, empty, emptyLabel } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const isSelfScrolling = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || isSelfScrolling.current) return;
    if (Math.abs(el.scrollTop - scrollTop) > 1) {
      el.scrollTop = scrollTop;
    }
  }, [scrollTop]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    isSelfScrolling.current = true;
    onScroll(e.currentTarget.scrollTop);
    requestAnimationFrame(() => {
      isSelfScrolling.current = false;
    });
  };

  return (
    <div className="flex flex-col min-w-0 border border-border rounded-md overflow-hidden">
      <div className="px-3 py-1.5 border-b border-border bg-bg-secondary text-[11px] font-mono text-text-secondary truncate">
        {label}
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto bg-bg font-mono text-[12px] leading-[18px]"
        onScroll={handleScroll}
      >
        {empty ? (
          <div className="p-4 text-text-muted italic text-xs">{emptyLabel}</div>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line, i) => {
                const lineNum = i + 1;
                const status = statusMap.get(lineNum);
                const tokens = highlighted?.[i]?.tokens;
                const changed = status === (side === 'old' ? 'delete' : 'add');
                const bgClass = changed
                  ? (side === 'old' ? 'bg-deleted/10' : 'bg-added/10')
                  : '';
                const markerClass = changed
                  ? (side === 'old' ? 'bg-deleted/30' : 'bg-added/30')
                  : 'bg-transparent';
                return (
                  <tr key={i} className={bgClass}>
                    <td className="w-11 text-right pr-2 pl-1 text-text-muted select-none align-top tabular-nums text-[10px] border-r border-border/50 sticky left-0 bg-inherit">
                      {lineNum}
                    </td>
                    <td className={`w-1 ${markerClass}`} />
                    <td className="px-2 whitespace-pre break-all">
                      {tokens ? renderTokens(tokens) : (line || <span>&nbsp;</span>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function FullFileCompare(props: FullFileCompareProps) {
  const { b1, b2, filePath, oldPath, newPath, status, mode, initialViewMode, theme, onClose } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [viewMode, setViewMode] = useState<PaneViewMode>(initialViewMode);
  const [syncedScrollTop, setSyncedScrollTop] = useState(0);
  const [scrollSync, setScrollSync] = useState(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const { data, isLoading, error } = useQuery(fileDiffOptions(b1, b2, filePath, mode));
  const { highlight, ready } = useHighlighter();

  const content1Lines = useMemo(() => {
    const c = data?.content1;
    if (c == null) return [] as string[];
    const arr = c.split('\n');
    if (arr.length > 0 && arr[arr.length - 1] === '') arr.pop();
    return arr;
  }, [data?.content1]);

  const content2Lines = useMemo(() => {
    const c = data?.content2;
    if (c == null) return [] as string[];
    const arr = c.split('\n');
    if (arr.length > 0 && arr[arr.length - 1] === '') arr.pop();
    return arr;
  }, [data?.content2]);

  const { oldStatus, newStatus } = useMemo(() => {
    const hunks = data?.files?.files?.[0]?.hunks ?? [];
    return buildLineStatus(hunks);
  }, [data]);

  const leftHighlightPath = oldPath || filePath;
  const rightHighlightPath = newPath || filePath;

  const leftHighlighted = useMemo(() => {
    if (!ready || !data?.content1) return null;
    return highlight(data.content1, leftHighlightPath, theme);
  }, [ready, data?.content1, leftHighlightPath, theme, highlight]);

  const rightHighlighted = useMemo(() => {
    if (!ready || !data?.content2) return null;
    return highlight(data.content2, rightHighlightPath, theme);
  }, [ready, data?.content2, rightHighlightPath, theme, highlight]);

  const stats = useMemo(() => {
    const file = data?.files?.files?.[0];
    return {
      additions: file?.additions ?? 0,
      deletions: file?.deletions ?? 0,
    };
  }, [data]);

  const handleLeftScroll = (top: number) => {
    if (scrollSync) setSyncedScrollTop(top);
  };
  const handleRightScroll = (top: number) => {
    if (scrollSync) setSyncedScrollTop(top);
  };

  const title = oldPath && newPath && oldPath !== newPath
    ? `${oldPath} → ${newPath}`
    : filePath;

  return (
    <dialog
      ref={dialogRef}
      className="bg-bg text-text border border-border rounded-xl shadow-md w-[95vw] max-w-[1400px] h-[92vh] backdrop:bg-black/60 backdrop:backdrop-blur-sm p-0 m-auto fixed inset-0"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wide shrink-0">Full file</span>
            <span className="font-mono text-xs truncate text-text" title={title}>{title}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted font-mono uppercase tracking-wide shrink-0">
              {mode}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[11px] text-text-muted font-mono">
              <span className="text-added">+{stats.additions}</span>{' '}
              <span className="text-deleted">-{stats.deletions}</span>
            </span>
            <div className="flex items-center gap-0.5 bg-bg-secondary rounded p-0.5 border border-border">
              <button
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] cursor-pointer ${
                  viewMode === 'split' ? 'bg-bg text-text shadow-sm' : 'text-text-muted hover:text-text'
                }`}
                onClick={() => setViewMode('split')}
                title="Split view"
              >
                <SplitViewIcon className="w-3 h-3" />
                Split
              </button>
              <button
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] cursor-pointer ${
                  viewMode === 'unified' ? 'bg-bg text-text shadow-sm' : 'text-text-muted hover:text-text'
                }`}
                onClick={() => setViewMode('unified')}
                title="Unified view"
              >
                <UnifiedViewIcon className="w-3 h-3" />
                Unified
              </button>
            </div>
            {viewMode === 'split' && (
              <label className="flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={scrollSync}
                  onChange={(e) => setScrollSync(e.target.checked)}
                  className="w-3 h-3 cursor-pointer"
                />
                Sync scroll
              </label>
            )}
            <button
              className="p-1 rounded-md text-text-muted hover:text-text hover:bg-hover cursor-pointer"
              onClick={onClose}
              title="Close (Esc)"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden p-3">
          {isLoading ? (
            <div className="flex items-center justify-center h-full gap-2 text-text-muted text-sm">
              <Spinner className="w-4 h-4" />
              Loading file contents…
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-deleted text-sm">
              Failed to load file content
            </div>
          ) : viewMode === 'split' ? (
            <div className="grid grid-cols-2 gap-3 h-full min-h-0">
              <FilePane
                side="old"
                lines={content1Lines}
                highlighted={leftHighlighted}
                statusMap={oldStatus}
                onScroll={handleLeftScroll}
                scrollTop={syncedScrollTop}
                label={`${b1}${oldPath && oldPath !== filePath ? ` · ${oldPath}` : ''}`}
                empty={status === 'added'}
                emptyLabel="File does not exist on this side"
              />
              <FilePane
                side="new"
                lines={content2Lines}
                highlighted={rightHighlighted}
                statusMap={newStatus}
                onScroll={handleRightScroll}
                scrollTop={syncedScrollTop}
                label={`${b2}${newPath && newPath !== filePath ? ` · ${newPath}` : ''}`}
                empty={status === 'deleted'}
                emptyLabel="File does not exist on this side"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 h-full min-h-0">
              <UnifiedPane
                oldLines={content1Lines}
                newLines={content2Lines}
                oldHighlighted={leftHighlighted}
                newHighlighted={rightHighlighted}
                oldStatus={oldStatus}
                newStatus={newStatus}
              />
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}

interface UnifiedPaneProps {
  oldLines: string[];
  newLines: string[];
  oldHighlighted: HighlightedTokens[] | null;
  newHighlighted: HighlightedTokens[] | null;
  oldStatus: Map<number, OldLineStatus>;
  newStatus: Map<number, NewLineStatus>;
}

/**
 * Unified pane: walks both files from the top. Where lines are unchanged (both
 * mapped as 'context' in their hunks, or outside any hunk and matching content),
 * show one row. Where content differs, show the old (delete) rows above the
 * new (add) rows. This stays anchored on the new-side numbering for navigation.
 */
function UnifiedPane(props: UnifiedPaneProps) {
  const { oldLines, newLines, oldHighlighted, newHighlighted, oldStatus, newStatus } = props;

  const rows = useMemo(() => {
    type Row =
      | { kind: 'context'; oldNum: number; newNum: number; content: string; tokens?: { text: string; color?: string }[] }
      | { kind: 'delete'; oldNum: number; content: string; tokens?: { text: string; color?: string }[] }
      | { kind: 'add'; newNum: number; content: string; tokens?: { text: string; color?: string }[] };

    const out: Row[] = [];
    let i = 0; // old index
    let j = 0; // new index

    while (i < oldLines.length || j < newLines.length) {
      const oldNum = i + 1;
      const newNum = j + 1;
      const oldS = i < oldLines.length ? oldStatus.get(oldNum) : undefined;
      const newS = j < newLines.length ? newStatus.get(newNum) : undefined;

      // Outside any hunk AND content matches -> context
      if (
        i < oldLines.length &&
        j < newLines.length &&
        oldS === undefined &&
        newS === undefined &&
        oldLines[i] === newLines[j]
      ) {
        out.push({
          kind: 'context',
          oldNum,
          newNum,
          content: oldLines[i],
          tokens: newHighlighted?.[j]?.tokens ?? oldHighlighted?.[i]?.tokens,
        });
        i++;
        j++;
        continue;
      }

      // Both hunk-context and equal -> unified context row
      if (oldS === 'context' && newS === 'context' && oldLines[i] === newLines[j]) {
        out.push({
          kind: 'context',
          oldNum,
          newNum,
          content: oldLines[i],
          tokens: newHighlighted?.[j]?.tokens ?? oldHighlighted?.[i]?.tokens,
        });
        i++;
        j++;
        continue;
      }

      // Emit deletes first
      if (oldS === 'delete') {
        out.push({
          kind: 'delete',
          oldNum,
          content: oldLines[i],
          tokens: oldHighlighted?.[i]?.tokens,
        });
        i++;
        continue;
      }

      // Then adds
      if (newS === 'add') {
        out.push({
          kind: 'add',
          newNum,
          content: newLines[j],
          tokens: newHighlighted?.[j]?.tokens,
        });
        j++;
        continue;
      }

      // Fallback: both sides advance, emit as paired context/add/delete based on equality
      if (i < oldLines.length && j < newLines.length) {
        if (oldLines[i] === newLines[j]) {
          out.push({
            kind: 'context',
            oldNum,
            newNum,
            content: oldLines[i],
            tokens: newHighlighted?.[j]?.tokens ?? oldHighlighted?.[i]?.tokens,
          });
          i++;
          j++;
        } else {
          out.push({
            kind: 'delete',
            oldNum,
            content: oldLines[i],
            tokens: oldHighlighted?.[i]?.tokens,
          });
          out.push({
            kind: 'add',
            newNum,
            content: newLines[j],
            tokens: newHighlighted?.[j]?.tokens,
          });
          i++;
          j++;
        }
      } else if (i < oldLines.length) {
        out.push({
          kind: 'delete',
          oldNum,
          content: oldLines[i],
          tokens: oldHighlighted?.[i]?.tokens,
        });
        i++;
      } else {
        out.push({
          kind: 'add',
          newNum,
          content: newLines[j],
          tokens: newHighlighted?.[j]?.tokens,
        });
        j++;
      }
    }

    return out;
  }, [oldLines, newLines, oldStatus, newStatus, oldHighlighted, newHighlighted]);

  return (
    <div className="border border-border rounded-md overflow-hidden flex flex-col min-h-0">
      <div className="overflow-auto bg-bg font-mono text-[12px] leading-[18px] flex-1">
        <table className="w-full border-collapse">
          <tbody>
            {rows.map((row, i) => {
              const bgClass =
                row.kind === 'add' ? 'bg-added/10' :
                row.kind === 'delete' ? 'bg-deleted/10' : '';
              const markerClass =
                row.kind === 'add' ? 'bg-added/40' :
                row.kind === 'delete' ? 'bg-deleted/40' : 'bg-transparent';
              const sign = row.kind === 'add' ? '+' : row.kind === 'delete' ? '-' : ' ';
              return (
                <tr key={i} className={bgClass}>
                  <td className="w-10 text-right pr-1 text-text-muted select-none align-top tabular-nums text-[10px]">
                    {row.kind === 'add' ? '' : (row as { oldNum: number }).oldNum}
                  </td>
                  <td className="w-10 text-right pr-2 text-text-muted select-none align-top tabular-nums text-[10px] border-r border-border/50">
                    {row.kind === 'delete' ? '' : (row as { newNum: number }).newNum}
                  </td>
                  <td className={`w-1 ${markerClass}`} />
                  <td className="w-4 text-center text-text-muted select-none text-[10px]">{sign}</td>
                  <td className="px-2 whitespace-pre break-all">
                    {row.tokens && row.tokens.length > 0
                      ? renderTokens(row.tokens)
                      : (row.content || <span>&nbsp;</span>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
