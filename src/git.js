'use strict';

const { execSync } = require('child_process');
const path = require('path');

function exec(cmd, cwd) {
  return execSync(cmd, {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function findGitRoot(cwd) {
  try {
    return exec('git rev-parse --show-toplevel', cwd);
  } catch {
    return null;
  }
}

function getCurrentBranch(cwd) {
  try {
    return exec('git rev-parse --abbrev-ref HEAD', cwd);
  } catch {
    return null;
  }
}

function getBranches(cwd) {
  try {
    const raw = exec('git branch -a', cwd);
    const seen = new Set();
    const result = [];

    for (const line of raw.split('\n')) {
      const b = line.replace(/^\*?\s+/, '').trim();
      if (!b || b.includes(' -> ') || b.includes('HEAD')) continue;

      // Keep remotes as "origin/branch" so git commands resolve them correctly.
      // git ls-tree / git show both accept "origin/branch" and resolve via
      // refs/remotes/origin/branch — stripping origin/ breaks remote-only branches.
      const name = b.startsWith('remotes/') ? b.slice('remotes/'.length) : b;

      if (!seen.has(name)) {
        seen.add(name);
        result.push(name);
      }
    }

    return result.sort();
  } catch {
    return [];
  }
}

// Returns { filePath: { hash, mode } } for all tracked files in a branch.
// Using blob hashes lets us skip fetching content for identical files — fast.
function getBlobMap(branch, cwd) {
  try {
    const output = exec(`git ls-tree -r "${branch}"`, cwd);
    const map = {};
    for (const line of output.split('\n').filter(Boolean)) {
      // Format: <mode> blob <hash>\t<path>
      const tabIdx = line.indexOf('\t');
      const meta = line.slice(0, tabIdx).trim().split(/\s+/);
      const filePath = line.slice(tabIdx + 1);
      map[filePath] = { hash: meta[2], mode: meta[0] };
    }
    return map;
  } catch {
    return {};
  }
}

// Compare two branches by blob hash. Returns only files that differ.
// This is O(n) on file count, not diff size — skips identical files cheaply.
function compareBranches(branch1, branch2, cwd) {
  const map1 = getBlobMap(branch1, cwd);
  const map2 = getBlobMap(branch2, cwd);

  const allPaths = new Set([...Object.keys(map1), ...Object.keys(map2)]);
  const files = [];

  for (const filePath of allPaths) {
    const e1 = map1[filePath];
    const e2 = map2[filePath];

    let status;
    if (!e1) status = 'added';         // exists only in branch2
    else if (!e2) status = 'deleted';  // exists only in branch1
    else if (e1.hash === e2.hash) continue; // identical blob — skip
    else status = 'modified';

    files.push({ path: filePath, status });
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

// Fetch raw file content from a branch (does not require checkout).
function getFileContent(branch, filePath, cwd) {
  try {
    return execSync(`git show "${branch}:${filePath}"`, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }
}

// Classic git diff (commit-level). Used in --mode git.
function getGitDiff(branch1, branch2, filePath, cwd) {
  try {
    return exec(
      filePath
        ? `git diff "${branch1}".."${branch2}" -- "${filePath}"`
        : `git diff "${branch1}".."${branch2}"`,
      cwd
    );
  } catch {
    return '';
  }
}

module.exports = {
  findGitRoot,
  getCurrentBranch,
  getBranches,
  compareBranches,
  getFileContent,
  getGitDiff,
};
