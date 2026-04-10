import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createThread,
  getThreadsForSession,
  addReply,
  updateThreadStatus,
  deleteThread,
  deleteAllThreadsForSession,
  editComment,
  deleteComment,
  type ThreadAuthor,
  type ThreadStatus,
} from './threads.js';
import { getCurrentSession } from './session.js';
import { sendJson, sendError, withJsonBody } from './http-utils.js';

export function handleReviewRoute(req: IncomingMessage, res: ServerResponse, pathname: string, url: URL): boolean {
  if (pathname === '/api/sessions/current' && req.method === 'GET') {
    const session = getCurrentSession();
    sendJson(res, session);
    return true;
  }

  if (pathname === '/api/threads' && req.method === 'GET') {
    const sid = url.searchParams.get('session');
    if (!sid) {
      sendError(res, 400, 'Missing session parameter');
      return true;
    }
    const status = url.searchParams.get('status') as ThreadStatus | null;
    const threads = getThreadsForSession(sid, status || undefined);
    sendJson(res, threads);
    return true;
  }

  if (pathname === '/api/threads' && req.method === 'DELETE') {
    withJsonBody(res, req, 'Failed to delete all threads', (body) => {
      const { sessionId: sid } = body;
      if (!sid) {
        sendError(res, 400, 'Missing sessionId');
        return;
      }
      deleteAllThreadsForSession(sid as string);
      sendJson(res, { ok: true });
    });
    return true;
  }

  if (pathname === '/api/threads' && req.method === 'POST') {
    withJsonBody(res, req, 'Failed to create thread', (body) => {
      const { sessionId: sid, filePath, side, startLine, endLine, body: commentBody, author, anchorContent } = body;
      if (!sid || !filePath || !side || typeof startLine !== 'number' || typeof endLine !== 'number' || !commentBody || !author) {
        sendError(res, 400, 'Missing required fields');
        return;
      }
      const thread = createThread(
        sid as string, filePath as string, side as string, startLine, endLine,
        commentBody as string, author as ThreadAuthor,
        anchorContent as string | undefined,
      );
      sendJson(res, thread);
    });
    return true;
  }

  const threadReplyMatch = pathname.match(/^\/api\/threads\/([^/]+)\/reply$/);
  if (threadReplyMatch && req.method === 'POST') {
    withJsonBody(res, req, 'Failed to add reply', (body) => {
      const { body: commentBody, author } = body;
      if (!commentBody || !author) {
        sendError(res, 400, 'Missing body or author');
        return;
      }
      const comment = addReply(threadReplyMatch[1], commentBody as string, author as ThreadAuthor);
      sendJson(res, comment);
    });
    return true;
  }

  const threadStatusMatch = pathname.match(/^\/api\/threads\/([^/]+)\/status$/);
  if (threadStatusMatch && req.method === 'PATCH') {
    withJsonBody(res, req, 'Failed to update thread status', (body) => {
      const { status, summary } = body;
      if (!status) {
        sendError(res, 400, 'Missing status');
        return;
      }
      const summaryAuthor = summary ? { name: 'System', type: 'user' as const } : undefined;
      updateThreadStatus(threadStatusMatch[1], status as ThreadStatus, summary as string | undefined, summaryAuthor);
      sendJson(res, { ok: true });
    });
    return true;
  }

  const threadDeleteMatch = pathname.match(/^\/api\/threads\/([^/]+)$/);
  if (threadDeleteMatch && req.method === 'DELETE') {
    try {
      deleteThread(threadDeleteMatch[1]);
      sendJson(res, { ok: true });
    } catch (err) {
      sendError(res, 500, `Failed to delete thread: ${err}`);
    }
    return true;
  }

  const commentEditMatch = pathname.match(/^\/api\/comments\/([^/]+)$/);
  if (commentEditMatch && req.method === 'PATCH') {
    withJsonBody(res, req, 'Failed to edit comment', (body) => {
      const { body: commentBody } = body;
      if (!commentBody) {
        sendError(res, 400, 'Missing body');
        return;
      }
      editComment(commentEditMatch[1], commentBody as string);
      sendJson(res, { ok: true });
    });
    return true;
  }

  const commentDeleteMatch = pathname.match(/^\/api\/comments\/([^/]+)$/);
  if (commentDeleteMatch && req.method === 'DELETE') {
    try {
      deleteComment(commentDeleteMatch[1]);
      sendJson(res, { ok: true });
    } catch (err) {
      sendError(res, 500, `Failed to delete comment: ${err}`);
    }
    return true;
  }

  // ── Export endpoint for AI consumption ──
  if (pathname === '/api/threads/export' && req.method === 'GET') {
    const sid = url.searchParams.get('session');
    if (!sid) {
      sendError(res, 400, 'Missing session parameter');
      return true;
    }
    const status = url.searchParams.get('status') as ThreadStatus | null;
    const format = url.searchParams.get('format') || 'json';
    const threads = getThreadsForSession(sid, status || undefined);

    const total = threads.length;
    const open = threads.filter(t => t.status === 'open').length;
    const resolved = threads.filter(t => t.status === 'resolved').length;
    const dismissed = threads.filter(t => t.status === 'dismissed').length;

    // Detect severity tags in comment bodies
    const severityPattern = /\[(must-fix|suggestion|nit|question)\]/i;

    const exported = threads.map(t => {
      const firstComment = t.comments[0]?.body || '';
      const severityMatch = firstComment.match(severityPattern);
      return {
        id: t.id,
        filePath: t.filePath,
        side: t.side,
        lines: t.startLine === t.endLine ? `${t.startLine}` : `${t.startLine}-${t.endLine}`,
        severity: severityMatch ? severityMatch[1].toLowerCase() : 'comment',
        status: t.status,
        comments: t.comments.map(c => ({
          author: c.author.name,
          authorType: c.author.type,
          body: c.body,
          createdAt: c.createdAt,
        })),
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      };
    });

    if (format === 'markdown') {
      const lines: string[] = [
        `# Review Comments — ${sid}`,
        '',
        `**Summary:** ${total} threads (${open} open, ${resolved} resolved, ${dismiss} dismissed)`,
        '',
      ];

      for (const thread of exported) {
        const severityLabel = thread.severity !== 'comment' ? `[${thread.severity}] ` : '';
        lines.push(`## ${severityLabel}${thread.filePath}:${thread.lines} (${thread.status})`);
        for (const comment of thread.comments) {
          lines.push(`> **${comment.author}** (${comment.authorType}):`);
          lines.push(`> ${comment.body}`);
          lines.push('');
        }
      }

      res.writeHead(200, {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'attachment; filename="review-comments.md"',
      });
      res.end(lines.join('\n'));
      return true;
    }

    sendJson(res, {
      summary: { total, open, resolved, dismissed },
      threads: exported,
    });
    return true;
  }

  // ── Agent endpoints for AI integration ──
  if (pathname === '/api/agent/threads' && req.method === 'GET') {
    const sid = url.searchParams.get('session');
    if (!sid) {
      sendError(res, 400, 'Missing session parameter');
      return true;
    }
    const status = url.searchParams.get('status') as ThreadStatus | null;
    const threads = getThreadsForSession(sid, status || undefined);
    sendJson(res, threads);
    return true;
  }

  if (pathname === '/api/agent/comment' && req.method === 'POST') {
    withJsonBody(res, req, 'Failed to post agent comment', (body) => {
      const { sessionId: sid, filePath, side, startLine, endLine, body: commentBody, severity } = body;
      if (!sid || !filePath || !commentBody || typeof startLine !== 'number' || typeof endLine !== 'number') {
        sendError(res, 400, 'Missing required fields (sessionId, filePath, body, startLine, endLine)');
        return;
      }
      const tag = severity ? `[${severity}] ` : '';
      const thread = createThread(
        sid as string, filePath as string, (side || 'right') as string,
        startLine as number, endLine as number,
        `${tag}${commentBody as string}`,
        { name: 'AI Agent', type: 'agent' },
      );
      sendJson(res, thread);
    });
    return true;
  }

  if (pathname === '/api/agent/resolve' && req.method === 'POST') {
    withJsonBody(res, req, 'Failed to resolve thread', (body) => {
      const { threadId, summary } = body;
      if (!threadId) {
        sendError(res, 400, 'Missing threadId');
        return;
      }
      const summaryAuthor = summary ? { name: 'AI Agent', type: 'agent' as const } : undefined;
      updateThreadStatus(threadId as string, 'resolved', summary as string | undefined, summaryAuthor);
      sendJson(res, { ok: true });
    });
    return true;
  }

  return false;
}
