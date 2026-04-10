'use strict';

const express = require('express');
const path = require('path');
const { execSync } = require('child_process');
const Diff = require('diff');
const { compareBranches, getFileContent, getGitDiff, getBranches } = require('./git');

function openBrowser(url) {
  const cmd =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32'  ? 'start ""' :
    'xdg-open';
  require('child_process').exec(`${cmd} "${url}"`);
}

// Heuristic: null bytes in first 8KB → binary file
function isBinary(content) {
  if (!content) return false;
  const sample = content.slice(0, 8192);
  return sample.includes('\0');
}

// Produce a unified diff patch using the `diff` package.
// This is file-level (content comparison), not git-history-level.
function buildFileDiff(filePath, content1, content2, branch1, branch2) {
  const a = content1 ?? '';
  const b = content2 ?? '';
  // Ensure trailing newline for clean diff output
  const normalise = s => (s.endsWith('\n') ? s : s + '\n');
  return Diff.createTwoFilesPatch(
    `a/${filePath}`,
    `b/${filePath}`,
    normalise(a),
    normalise(b),
    branch1,
    branch2,
    { context: 5 }
  );
}

function startServer({ branch1, branch2, port, mode, cwd, open: shouldOpen }) {
  const app = express();

  app.use(express.static(path.join(__dirname, '../public')));

  // Session config — UI reads this on load
  app.get('/api/config', (_req, res) => {
    res.json({
      branch1,
      branch2,
      mode,
      repoName: path.basename(cwd),
    });
  });

  // Full file comparison list for current branches
  app.get('/api/compare', (req, res) => {
    try {
      const b1 = req.query.b1 || branch1;
      const b2 = req.query.b2 || branch2;
      const files = compareBranches(b1, b2, cwd);
      res.json({ files, branch1: b1, branch2: b2, total: files.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Per-file diff — supports both modes
  app.get('/api/file-diff', (req, res) => {
    try {
      const { b1, b2, file, diffMode } = req.query;
      const effectiveMode = diffMode || mode;

      if (effectiveMode === 'git') {
        const patch = getGitDiff(b1, b2, file, cwd);
        return res.json({ patch, mode: 'git', file });
      }

      // File mode: compare actual content at branch tip, ignoring commit history
      const content1 = getFileContent(b1, file, cwd);
      const content2 = getFileContent(b2, file, cwd);

      if (isBinary(content1) || isBinary(content2)) {
        return res.json({ binary: true, mode: 'file', file });
      }

      const patch = buildFileDiff(file, content1, content2, b1, b2);
      res.json({ patch, mode: 'file', file });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Branch list — used by UI if it needs to re-run comparison
  app.get('/api/branches', (_req, res) => {
    try {
      const { getCurrentBranch } = require('./git');
      const current = getCurrentBranch(cwd);
      res.json({ branches: getBranches(cwd), current });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(port, () => {
    const params = `b1=${encodeURIComponent(branch1)}&b2=${encodeURIComponent(branch2)}&mode=${mode}`;
    const url = `http://localhost:${port}/?${params}`;
    console.log(`\n  branchdiff  ${branch1}  →  ${branch2}`);
    console.log(`  Mode: ${mode}-level diff`);
    console.log(`  Repo: ${cwd}`);
    console.log(`  URL:  \x1b[36m${url}\x1b[0m\n`);
    console.log('  Press Ctrl+C to stop.\n');
    if (shouldOpen) openBrowser(url);
  });
}

module.exports = { startServer };
