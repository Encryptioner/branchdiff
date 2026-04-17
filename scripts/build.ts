#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const [major] = process.versions.node.split('.').map(Number);
const nodeTooOldForUI = major < 20;

// Build library packages first (dependency order matters)
const libSteps = [
  'pnpm --filter @branchdiff/parser run build',
  'pnpm --filter @branchdiff/git run build',
  'pnpm --filter @branchdiff/github run build',
];

for (const step of libSteps) {
  execSync(step, { stdio: 'inherit', cwd: root });
}

// UI build: React Router 7 requires Node 20+ (rolldown uses util.styleText).
if (nodeTooOldForUI) {
  console.warn(
    `\n⚠️  Skipping UI build: Node ${process.version} is below the minimum (20). ` +
    `The CLI will bundle without the UI. Use Node 20+ for a full build.\n`,
  );
} else {
  execSync('pnpm --filter @branchdiff/ui run build', { stdio: 'inherit', cwd: root });
}

// Build CLI (bundles with esbuild)
execSync('pnpm --filter branchdiff run build', { stdio: 'inherit', cwd: root });

// Copy README + LICENSE into CLI package for npm publish.
// CHANGELOG lives in the package and is maintained there directly.
const cliDir = resolve(root, 'packages/cli');
for (const file of ['README.md', 'LICENSE.md']) {
  const src = resolve(root, file);
  if (existsSync(src)) {
    copyFileSync(src, resolve(cliDir, file));
  }
}
