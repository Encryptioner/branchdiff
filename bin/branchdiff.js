#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const readline = require('readline');
const { getBranches, findGitRoot, getCurrentBranch } = require('../src/git');
const { startServer } = require('../src/server');

program
  .name('branchdiff')
  .description('Visual file-level git branch diff in your browser')
  .argument('[branch1]', 'Base branch (omit to use current branch)')
  .argument('[branch2]', 'Compare branch')
  .option('-p, --port <port>', 'Port to serve on', '7823')
  .option(
    '--mode <mode>',
    'Diff mode: "git" (commit-level, default) or "file" (content-level)',
    'git'
  )
  .option('--no-open', 'Do not auto-open browser')
  .action(async (branch1, branch2, options) => {
    const cwd = findGitRoot(process.cwd());
    if (!cwd) {
      console.error('\x1b[31mError:\x1b[0m Not inside a git repository.');
      process.exit(1);
    }

    const branches = getBranches(cwd);
    const current = getCurrentBranch(cwd);

    // Single-branch shortcut: `branchdiff stage/prod`
    // → base = current branch, compare = stage/prod
    if (branch1 && !branch2) {
      branch2 = branch1;
      branch1 = current;
      if (!branch1) {
        console.error('\x1b[31mError:\x1b[0m Could not detect current branch (detached HEAD?).');
        process.exit(1);
      }
      console.log(`\x1b[2mBase: current branch (${branch1})\x1b[0m`);
    }

    // Interactive prompts with tab completion if branches still missing
    if (!branch1) {
      const label = current ? `Base branch [Enter = ${current}]` : 'Base branch';
      const answer = await promptBranch(branches, label);
      branch1 = answer || current;
    }
    if (!branch2) {
      branch2 = await promptBranch(branches, 'Compare branch');
    }

    if (!branch1 || !branch2) {
      console.error('\x1b[31mError:\x1b[0m Two branches are required.');
      process.exit(1);
    }

    // Validate — include current branch even if not in list (e.g. detached)
    const known = new Set([...branches, current].filter(Boolean));
    if (!known.has(branch1)) {
      console.error(`\x1b[31mError:\x1b[0m Branch "${branch1}" not found.`);
      process.exit(1);
    }
    if (!known.has(branch2)) {
      console.error(`\x1b[31mError:\x1b[0m Branch "${branch2}" not found.`);
      process.exit(1);
    }

    startServer({
      branch1,
      branch2,
      port: parseInt(options.port, 10),
      mode: options.mode,
      cwd,
      open: options.open,
    });
  });

program.parse();

// Interactive branch prompt with readline tab completion.
// Tab once = completes if unambiguous. Tab twice = lists all matches.
function promptBranch(branches, label) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      completer(line) {
        const hits = branches.filter(b => b.startsWith(line));
        return [hits.length ? hits : branches, line];
      },
    });

    const hint = branches.slice(0, 8).join('  ') + (branches.length > 8 ? `  …+${branches.length - 8}` : '');
    process.stdout.write(`\x1b[2m${hint}\x1b[0m\n`);

    rl.question(`\x1b[1m${label}:\x1b[0m `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
