import { exec, execLarge } from './exec.js';

export interface BlobEntry {
  hash: string;
  mode: string;
}

export interface DiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
}

/**
 * Returns { filePath: { hash, mode } } for all tracked files in a branch.
 * Uses blob hashes to skip fetching content for identical files.
 */
export function getBlobMap(branch: string): Record<string, BlobEntry> {
  try {
    const output = exec(`git ls-tree -r "${branch}"`);
    const map: Record<string, BlobEntry> = {};
    for (const line of output.split('\n').filter(Boolean)) {
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

/**
 * Compare two branches by blob hash. Returns only files that differ.
 * O(n) on file count — skips identical blobs cheaply without running diff.
 */
export function compareBranches(branch1: string, branch2: string): DiffFile[] {
  const map1 = getBlobMap(branch1);
  const map2 = getBlobMap(branch2);

  const allPaths = new Set([...Object.keys(map1), ...Object.keys(map2)]);
  const files: DiffFile[] = [];

  for (const filePath of allPaths) {
    const e1 = map1[filePath];
    const e2 = map2[filePath];

    let status: DiffFile['status'];
    if (!e1) status = 'added';
    else if (!e2) status = 'deleted';
    else if (e1.hash === e2.hash) continue;
    else status = 'modified';

    files.push({ path: filePath, status });
  }

  // Sort: modified first, then added, then deleted — within each group alphabetically
  const statusOrder: Record<string, number> = { modified: 0, added: 1, deleted: 2 };
  return files.sort((a, b) => {
    const so = statusOrder[a.status] - statusOrder[b.status];
    return so !== 0 ? so : a.path.localeCompare(b.path);
  });
}

/**
 * Fetch raw file content from a branch without checkout.
 */
export function getBranchFileContent(branch: string, filePath: string): string | null {
  try {
    return execLarge(`git show "${branch}:${filePath}"`);
  } catch {
    return null;
  }
}

/**
 * Get all branches (local + remote) for the current repo.
 */
export function getBranches(): string[] {
  try {
    const raw = exec('git branch -a');
    const seen = new Set<string>();
    const result: string[] = [];

    for (const line of raw.split('\n')) {
      const b = line.replace(/^\*?\s+/, '').trim();
      if (!b || b.includes(' -> ') || b.includes('HEAD')) continue;

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
