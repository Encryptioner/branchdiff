#!/usr/bin/env node

import { execSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import concurrently from 'concurrently';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

execSync('tsx scripts/link-dev.ts', {
  cwd: rootDir,
  stdio: 'inherit',
});

concurrently(
  [
    { command: 'pnpm run dev -w @branchdiff/parser', name: 'parser' },
    { command: 'pnpm run dev -w @branchdiff/git', name: 'git' },
    { command: 'pnpm run dev:watch -w branchdiff', name: 'cli' },
    { command: 'pnpm run -w @branchdiff/ui vite build --watch', name: 'ui' },
  ],
  {
    prefixColors: ['blue', 'green', 'yellow', 'magenta'],
  }
);
