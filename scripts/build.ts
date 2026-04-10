#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { copyFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Build library packages first (dependency order matters)
const libSteps = [
  'pnpm --filter @branchdiff/parser run build',
  'pnpm --filter @branchdiff/git run build',
  'pnpm --filter @branchdiff/github run build',
];

for (const step of libSteps) {
  execSync(step, { stdio: 'inherit', cwd: root });
}

// UI build: client phase succeeds, server phase fails under pnpm strict mode.
// This is expected — we use ssr:false so only the client build matters.
try {
  execSync('pnpm --filter @branchdiff/ui run build', { stdio: 'inherit', cwd: root });
} catch {
  console.log('(UI server build skipped — expected with pnpm strict mode)');
}

// Generate index.html from the Vite manifest
const clientDir = join(root, 'packages/cli/dist/ui/client');
const manifestPath = join(clientDir, '.vite/manifest.json');
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  let entryClientFile = '';
  for (const [, value] of Object.entries(manifest)) {
    const v = value as { isEntry?: boolean; file: string };
    if (v.isEntry && v.file.includes('entry.client')) {
      entryClientFile = v.file;
      break;
    }
  }
  if (entryClientFile) {
    const cssFiles = Object.values(manifest)
      .filter((v: unknown) => {
        const entry = v as { file: string; isEntry?: boolean; src?: string };
        return entry.file.endsWith('.css') && entry.src?.includes('root.tsx');
      })
      .map((v: unknown) => (v as { file: string }).file);

    const cssLinks = cssFiles.map(f => `    <link rel="stylesheet" href="/${f}" />`).join('\n');
    writeFileSync(join(clientDir, 'index.html'), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <title>BranchDiff</title>
${cssLinks}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${entryClientFile}"></script>
  </body>
</html>
`);
    console.log('Generated index.html for client SPA');
  }
} else {
  console.log('Warning: No Vite manifest found, skipping index.html generation');
}

// Build CLI (bundles with esbuild)
execSync('pnpm --filter branchdiff run build', { stdio: 'inherit', cwd: root });

// Copy README into CLI package for npm publish
const readmeSrc = resolve(root, 'README.md');
if (existsSync(readmeSrc)) {
  copyFileSync(readmeSrc, resolve(root, 'packages/cli/README.md'));
}
