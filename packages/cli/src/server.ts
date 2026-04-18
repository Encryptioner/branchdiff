import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createHash } from 'node:crypto';
import { execSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Run a git command asynchronously. Safer than `execSync` because arguments are
 * passed as an array (no shell quoting), and the Node HTTP event loop isn't
 * blocked while git runs — important on repos where a single diff can take
 * several hundred milliseconds.
 */
async function gitAsync(args: string[], maxBuffer = 20 * 1024 * 1024): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      encoding: 'utf-8',
      maxBuffer,
    });
    return stdout;
  } catch {
    return '';
  }
}
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { parseDiff, type ParsedDiff } from '@branchdiff/parser';
import {
  getDiff,
  getDiffStatForRef,
  getDiffStat,
  getUntrackedFiles,
  getUntrackedDiff,
  getRepoInfo,
  getRepoName,
  getCurrentBranch,
  getFileContent,
  getStagedFiles,
  getUnstagedFiles,
  getRecentCommits,
  getBranchCommits,
  getFileLineCount,
  resolveBaseRef,
  resolveDiffArgs,
  resolveRef,
  revertFile,
  revertHunk,
  getRefCapabilities,
  getHeadHash,
  isDirty,
  getTree,
  getTreeEntries,
  getTreeFingerprint,
  getWorkingTreeFileContent,
  getWorkingTreeRawFile,
  WORKING_TREE_REFS,
} from '@branchdiff/git';
import {
  detectRemote as detectGitHubRemote,
  fetchDetails as fetchGitHubDetails,
  pushComments as pushGitHubComments,
  pullComments as pullGitHubComments,
  type PrComment,
} from '@branchdiff/github';
import {
  compareBranches,
  getBranchFileContent,
  getBranches as getGitBranches,
} from '@branchdiff/git'; // re-exported from blob-diff via git index
import { findOrCreateSession } from './session.js';
import { createThread, addReply, getThreadsForSession } from './threads.js';
import { handleReviewRoute } from './review-routes.js';
import { handleTourRoute } from './tour-routes.js';
import { sendJson, sendError, readBody } from './http-utils.js';
import {
  registerInstance,
  deregisterInstance
} from './registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

interface ServerOptions {
  port: number;
  portIsExplicit?: boolean;
  diffArgs: string[];
  description?: string;
  effectiveRef?: string;
  version?: string;
  registryInfo?: {
    repoRoot: string;
    repoHash: string;
    repoName: string;
  };
  branch1?: string;
  branch2?: string;
  mode?: 'file' | 'git' | 'delta';
}

function serveStatic(res: ServerResponse, filePath: string) {
  if (!existsSync(filePath)) {
    sendError(res, 404, 'Not found');
    return;
  }
  const ext = extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  const content = readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': mime });
  res.end(content);
}

function descriptionForRef(ref: string): string {
  if (WORKING_TREE_REFS.has(ref)) {
    const labels: Record<string, string> = {
      staged: 'Staged changes',
      unstaged: 'Unstaged changes',
      work: 'All changes',
      '.': 'All changes',
    };
    return labels[ref] || ref;
  }
  if (ref.includes('..')) {
    return ref;
  }
  return `Changes from ${ref}`;
}

interface ServerResult {
  port: number;
  close: () => void;
}

export function startServer(options: ServerOptions): Promise<ServerResult> {
  const {
    port,
    portIsExplicit,
    diffArgs,
    description,
    effectiveRef,
    version,
    registryInfo,
    branch1,
    branch2,
    mode: diffMode,
  } = options;

  const includeUntracked = diffArgs.length === 0;

  function enrichWithLineCounts(diff: ParsedDiff, baseRef: string): ParsedDiff {
    for (const file of diff.files) {
      if (file.status === 'added' || file.isBinary) {
        continue;
      }
      const path = file.oldPath || file.newPath;
      const count = getFileLineCount(path, baseRef);
      if (count !== null) {
        file.oldFileLineCount = count;
      }
    }
    return diff;
  }

  function getFullDiff(args: string[]): string {
    let raw = getDiff(args);
    if (includeUntracked) {
      const untrackedFiles = getUntrackedFiles();
      if (untrackedFiles.length > 0) {
        raw += '\n' + getUntrackedDiff(untrackedFiles);
      }
    }
    return raw;
  }

  const githubRemote = detectGitHubRemote();
  const uiDir = join(__dirname, 'ui/client');

  let editorAvailable: 'vscode' | null = null;
  try {
    execSync('which code', { stdio: 'pipe' });
    editorAvailable = 'vscode';
  } catch {
    // VS Code CLI not found
  }

  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url || '/', `http://localhost:${port}`);
        const pathname = url.pathname;

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET, POST, PATCH, DELETE, OPTIONS',
        );
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (pathname === '/api/revert-file' && req.method === 'POST') {
          try {
            const body = JSON.parse(await readBody(req));
            const { filePath: path, isUntracked } = body;
            if (!path || typeof path !== 'string') {
              sendError(res, 400, 'Missing filePath');
              return;
            }
            revertFile(path, !!isUntracked);
            sendJson(res, { ok: true });
          } catch (err) {
            sendError(res, 500, `Failed to revert file: ${err}`);
          }
          return;
        }

        if (pathname === '/api/revert-hunk' && req.method === 'POST') {
          try {
            const body = JSON.parse(await readBody(req));
            const { patch } = body;
            if (!patch || typeof patch !== 'string') {
              sendError(res, 400, 'Missing patch');
              return;
            }
            revertHunk(patch);
            sendJson(res, { ok: true });
          } catch (err) {
            sendError(res, 500, `Failed to revert hunk: ${err}`);
          }
          return;
        }

        if (pathname === '/api/open-in-editor' && req.method === 'POST') {
          if (!editorAvailable) {
            sendError(res, 404, 'No editor available');
            return;
          }
          try {
            const body = JSON.parse(await readBody(req));
            const { filePath, line } = body;
            if (typeof filePath !== 'string') {
              sendError(res, 400, 'Missing filePath');
              return;
            }
            const repoRoot = getRepoInfo().root;
            const fullPath = filePath ? join(repoRoot, filePath) : repoRoot;
            const gotoArg = line ? `${fullPath}:${line}` : fullPath;
            execFile('code', [repoRoot, '--goto', gotoArg], { timeout: 5000 }, () => {});
            sendJson(res, { ok: true });
          } catch (err) {
            sendError(res, 500, `Failed to open editor: ${err}`);
          }
          return;
        }

        if (pathname === '/api/overview') {
          try {
            const staged = getStagedFiles();
            const unstaged = getUnstagedFiles();
            const untracked = getUntrackedFiles();

            const fileMap = new Map<string, string>();
            for (const f of staged) {
              fileMap.set(f, 'staged');
            }
            for (const f of unstaged) {
              fileMap.set(f, 'modified');
            }
            for (const f of untracked) {
              fileMap.set(f, 'added');
            }

            const files = Array.from(fileMap.entries()).map(
              ([path, status]) => ({ path, status }),
            );

            sendJson(res, { files });
          } catch (err) {
            sendError(res, 500, `Failed to get overview: ${err}`);
          }
          return;
        }

        if (pathname === '/api/commits') {
          const count = parseInt(url.searchParams.get('count') || '10', 10);
          const skip = parseInt(url.searchParams.get('skip') || '0', 10);
          const search = url.searchParams.get('search') || undefined;
          try {
            const commits = getRecentCommits({ count, skip, search });
            sendJson(res, { commits, hasMore: commits.length === count });
          } catch (err) {
            sendError(res, 500, `Failed to get commits: ${err}`);
          }
          return;
        }

        if (pathname === '/api/branch-commits') {
          const b1 = url.searchParams.get('b1');
          const b2 = url.searchParams.get('b2');
          if (!b1 || !b2) {
            sendError(res, 400, 'Missing b1 or b2 query params');
            return;
          }
          try {
            const commits = getBranchCommits(b1, b2);
            sendJson(res, { commits });
          } catch (err) {
            sendError(res, 500, `Failed to get branch commits: ${err}`);
          }
          return;
        }

        if (pathname === '/api/diff-fingerprint') {
          const ref = url.searchParams.get('ref');
          let stat: string;
          if (ref) {
            stat = getDiffStatForRef(ref);
          } else {
            stat = getDiffStat(diffArgs);
            if (includeUntracked) {
              stat += '\n' + getUntrackedFiles().join('\n');
            }
          }
          const hash = createHash('sha1')
            .update(stat)
            .digest('hex')
            .slice(0, 12);
          sendJson(res, { fingerprint: hash });
          return;
        }

        if (pathname === '/api/diff/ref') {
          const ref = url.searchParams.get('ref');
          const resolved = ref ? resolveDiffArgs(ref) : null;

          if (resolved) {
            sendJson(res, { args: resolved.args.join(' ') });
          } else {
            const args = diffArgs.length > 0 ? diffArgs : ['HEAD'];
            sendJson(res, { args: args.join(' ') });
          }
          return;
        }

        if (pathname === '/api/diff') {
          const ref = url.searchParams.get('ref');
          const whitespace = url.searchParams.get('whitespace');
          const extraArgs = whitespace === 'hide' ? ['-w'] : [];
          const baseRef = ref ? resolveBaseRef(ref) : 'HEAD';

          if (ref) {
            sendJson(
              res,
              enrichWithLineCounts(
                parseDiff(resolveRef(ref, extraArgs)),
                baseRef,
              ),
            );
            return;
          }

          const args = whitespace === 'hide' ? [...diffArgs, '-w'] : diffArgs;
          sendJson(
            res,
            enrichWithLineCounts(parseDiff(getFullDiff(args)), baseRef),
          );
          return;
        }

        if (pathname.startsWith('/api/file/')) {
          const filePath = decodeURIComponent(
            pathname.slice('/api/file/'.length),
          );
          const ref = url.searchParams.get('ref') || undefined;
          const baseRef = ref ? resolveBaseRef(ref) : 'HEAD';
          try {
            const content = getFileContent(filePath, baseRef);
            sendJson(res, { path: filePath, content: content.split('\n') });
          } catch {
            sendError(res, 404, `File not found: ${filePath}`);
          }
          return;
        }

        if (pathname === '/api/info') {
          const ref = url.searchParams.get('ref') || effectiveRef;
          const info = getRepoInfo();
          let refDescription =
            description || diffArgs.join(' ') || 'Unstaged changes';
          if (url.searchParams.get('ref')) {
            refDescription = descriptionForRef(url.searchParams.get('ref')!);
          }
          const capabilities = getRefCapabilities(ref);
          let sessionId: string | null = null;
          if (ref) {
            const session = findOrCreateSession(ref);
            sessionId = session.id;
          }
          sendJson(res, {
            ...info,
            description: refDescription,
            capabilities,
            sessionId,
            github: githubRemote,
            editor: editorAvailable,
          });
          return;
        }

        if (pathname === '/api/github/details') {
          if (!githubRemote) {
            sendJson(res, null);
            return;
          }
          const details = fetchGitHubDetails(githubRemote.owner, githubRemote.repo);
          sendJson(res, details);
          return;
        }

        if (pathname === '/api/github/push-comments' && req.method === 'POST') {
          const details = githubRemote ? fetchGitHubDetails(githubRemote.owner, githubRemote.repo) : null;
          if (!githubRemote || !details?.headSha) {
            sendError(res, 400, 'No GitHub PR detected');
            return;
          }
          const localHead = getHeadHash();
          if (localHead !== details.headSha) {
            sendError(res, 409, 'Local branch is out of sync with the PR. Push or pull your git changes first.');
            return;
          }
          if (isDirty()) {
            sendError(res, 409, 'You have uncommitted local changes. Commit or stash them first.');
            return;
          }
          const body = JSON.parse(await readBody(req));
          const comments = body.comments as PrComment[];
          if (!Array.isArray(comments) || comments.length === 0) {
            sendError(res, 400, 'No comments provided');
            return;
          }
          const result = pushGitHubComments(
            githubRemote.owner,
            githubRemote.repo,
            details.prNumber,
            details.headSha,
            comments,
          );
          sendJson(res, result);
          return;
        }

        if (pathname === '/api/github/pull-comments' && req.method === 'POST') {
          if (!githubRemote) {
            sendError(res, 400, 'No GitHub repo detected');
            return;
          }
          const details = fetchGitHubDetails(githubRemote.owner, githubRemote.repo);
          if (!details) {
            sendError(res, 400, 'No GitHub PR detected');
            return;
          }
          const body = JSON.parse(await readBody(req));
          const { sessionId: sid } = body;
          if (!sid) {
            sendError(res, 400, 'Missing sessionId');
            return;
          }

          const localHead = getHeadHash();
          if (localHead !== details.headSha) {
            sendError(res, 409, 'Local branch is out of sync with the PR. Push or pull your git changes first.');
            return;
          }
          if (isDirty()) {
            sendError(res, 409, 'You have uncommitted local changes. Commit or stash them first.');
            return;
          }

          const remoteThreads = pullGitHubComments(githubRemote.owner, githubRemote.repo, details.prNumber);
          const localThreads = getThreadsForSession(sid);

          let pulled = 0;
          let skipped = 0;
          for (const rt of remoteThreads) {
            const firstComment = rt.comments[0];
            const alreadyExists = localThreads.some(t =>
              t.filePath === rt.filePath &&
              t.side === rt.side &&
              t.startLine === rt.startLine &&
              t.endLine === rt.endLine &&
              t.comments.some(c => c.body === firstComment.body),
            );
            if (alreadyExists) {
              skipped++;
              continue;
            }
            const thread = createThread(sid, rt.filePath, rt.side, rt.startLine, rt.endLine, firstComment.body, {
              name: firstComment.authorName,
              type: firstComment.authorType,
            });
            for (let i = 1; i < rt.comments.length; i++) {
              const reply = rt.comments[i];
              addReply(thread.id, reply.body, {
                name: reply.authorName,
                type: reply.authorType,
              });
            }
            pulled++;
          }
          sendJson(res, { pulled, skipped });
          return;
        }

        if (pathname === '/api/tree/fingerprint') {
          const raw = getTreeFingerprint();
          const hash = createHash('sha1')
            .update(raw)
            .digest('hex')
            .slice(0, 12);
          sendJson(res, { fingerprint: hash });
          return;
        }

        if (pathname === '/api/tree') {
          try {
            const paths = getTree();
            sendJson(res, { paths });
          } catch (err) {
            sendError(res, 500, `Failed to get tree: ${err}`);
          }
          return;
        }

        if (pathname === '/api/tree/entries') {
          try {
            const dirPath = url.searchParams.get('path') || undefined;
            const entries = getTreeEntries('HEAD', dirPath);
            sendJson(res, { entries });
          } catch (err) {
            sendError(res, 500, `Failed to get tree entries: ${err}`);
          }
          return;
        }

        if (pathname.startsWith('/api/tree/file/')) {
          const filePath = decodeURIComponent(
            pathname.slice('/api/tree/file/'.length),
          );
          try {
            const content = getWorkingTreeFileContent(filePath);
            sendJson(res, { path: filePath, content: content.split('\n') });
          } catch {
            sendError(res, 404, `File not found: ${filePath}`);
          }
          return;
        }

        if (pathname.startsWith('/api/tree/raw/')) {
          const filePath = decodeURIComponent(
            pathname.slice('/api/tree/raw/'.length),
          );
          try {
            const { data } = getWorkingTreeRawFile(filePath);
            const ext = extname(filePath);
            const mime = MIME_TYPES[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': mime });
            res.end(data);
          } catch {
            sendError(res, 404, `File not found: ${filePath}`);
          }
          return;
        }

        if (pathname === '/api/tree/info') {
          const info = getRepoInfo();
          const session = findOrCreateSession('__tree__');
          sendJson(res, {
            ...info,
            description: 'Repository file browser',
            capabilities: { reviews: true, revert: false, staleness: false },
            sessionId: session.id,
            github: githubRemote,
            editor: editorAvailable,
          });
          return;
        }

        // Branch diff routes
        if (pathname === '/api/branches' && req.method === 'GET') {
          const branches = getGitBranches();
          const current = getCurrentBranch();
          sendJson(res, { branches, current });
          return;
        }

        if (pathname === '/api/compare' && req.method === 'GET') {
          const b1 = url.searchParams.get('b1');
          const b2 = url.searchParams.get('b2');
          const mode = url.searchParams.get('mode') || 'file';
          if (!b1 || !b2) {
            sendError(res, 400, 'Missing b1 or b2 query params');
            return;
          }

          let files: Array<{ path: string; status: 'added' | 'modified' | 'deleted' }>;
          if (mode === 'git') {
            // Git mode: use standard git diff (async — doesn't block event loop)
            const output = await gitAsync(['diff', `${b1}..${b2}`, '--name-status']);
            files = output
              .split('\n')
              .filter(Boolean)
              .map(line => {
                const [status, ...pathParts] = line.split('\t');
                const path = pathParts.join('\t');
                let s: 'added' | 'modified' | 'deleted' = 'modified';
                if (status === 'A') s = 'added';
                else if (status === 'D') s = 'deleted';
                return { path, status: s };
              });
          } else {
            // File mode: use blob comparison (default)
            files = compareBranches(b1, b2);
          }

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
          return;
        }

        if (pathname === '/api/file-diff' && req.method === 'GET') {
          const b1 = url.searchParams.get('b1');
          const b2 = url.searchParams.get('b2');
          const file = url.searchParams.get('file');
          const mode = url.searchParams.get('mode') || 'file';
          if (!b1 || !b2 || !file) {
            sendError(res, 400, 'Missing b1, b2, or file query params');
            return;
          }
          const content1 = getBranchFileContent(b1, file);
          const content2 = getBranchFileContent(b2, file);

          let patch = '';
          if (mode === 'git') {
            // Git mode: standard commit-based diff (async)
            patch = await gitAsync(['diff', `${b1}..${b2}`, '--', file]);
          } else if (content1 !== null && content2 !== null) {
            // File mode, both sides exist: compare blobs directly for proper diff with context
            patch = await gitAsync(['diff', `${b1}:${file}`, `${b2}:${file}`]);
          } else if (content1 === null && content2 !== null) {
            // File was added: all lines are additions
            const lines = content2.split('\n');
            if (lines[lines.length - 1] === '') lines.pop();
            patch = `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n`;
            for (const line of lines) {
              patch += `+${line}\n`;
            }
          } else if (content1 !== null && content2 === null) {
            // File was deleted: all lines are deletions
            const lines = content1.split('\n');
            if (lines[lines.length - 1] === '') lines.pop();
            patch = `diff --git a/${file} b/${file}\ndeleted file mode 100644\n--- a/${file}\n+++ /dev/null\n@@ -1,${lines.length} +0,0 @@\n`;
            for (const line of lines) {
              patch += `-${line}\n`;
            }
          }

          const parsed = patch ? parseDiff(patch) : [];
          sendJson(res, { patch, files: parsed, content1, content2 });
          return;
        }

        if (pathname === '/api/config' && req.method === 'GET') {
          const b1 = url.searchParams.get('b1') || branch1 || '';
          const b2 = url.searchParams.get('b2') || branch2 || '';
          const configMode = url.searchParams.get('mode') || diffMode || 'file';
          sendJson(res, {
            branch1: b1,
            branch2: b2,
            mode: configMode,
            repoName: getRepoName(),
          });
          return;
        }

        if (handleReviewRoute(req, res, pathname, url)) {
          return;
        }

        if (handleTourRoute(req, res, pathname, url)) {
          return;
        }

        let filePath = join(uiDir, pathname === '/' ? 'index.html' : pathname);
        if (!existsSync(filePath)) {
          filePath = join(uiDir, 'index.html');
        }
        serveStatic(res, filePath);
      } catch (err) {
        if (!res.headersSent) {
          sendError(res, 500, `${err instanceof Error ? err.message : err}`);
        }
      }
    },
  );

  const closeFn = () => {
    deregisterInstance(process.pid);
    server.close();
  };

  return new Promise((resolve, reject) => {
    let currentPort = port;
    let retries = 0;
    const maxRetries = portIsExplicit ? 0 : 10;

    const onError = (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && retries < maxRetries) {
        retries++;
        server.close();
        currentPort++;
        setTimeout(() => server.listen(currentPort), 200);
      } else if (err.code === 'EADDRINUSE' && portIsExplicit) {
        reject(new Error(`Port ${port} is already in use`));
      } else {
        reject(err);
      }
    };

    server.on('error', onError);
    server.on('listening', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        if (effectiveRef) {
          findOrCreateSession(effectiveRef);
        }
        if (registryInfo) {
          registerInstance({
            pid: process.pid,
            port: addr.port,
            repoRoot: registryInfo.repoRoot,
            repoHash: registryInfo.repoHash,
            repoName: registryInfo.repoName,
            ref: effectiveRef || 'work',
            description: description || 'Unstaged changes',
            startedAt: new Date().toISOString(),
            version,
          });
        }
        resolve({ port: addr.port, close: closeFn });
      }
    });

    server.listen(currentPort);
  });
}
