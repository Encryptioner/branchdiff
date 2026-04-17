import type { Command } from 'commander';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import pc from 'picocolors';
// @ts-expect-error — esbuild inlines .sh files as text strings
import ZSH_SCRIPT from '../completions/zsh.sh';
// @ts-expect-error — esbuild inlines .sh files as text strings
import BASH_SCRIPT from '../completions/bash.sh';

const ZSH_DIR = join(homedir(), '.zfunc');
const ZSH_FILE = join(ZSH_DIR, '_branchdiff');
const BASH_DIR = join(homedir(), '.local', 'share', 'bash-completion', 'completions');
const BASH_FILE = join(BASH_DIR, 'branchdiff');

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function removeOldEvalLine(configFile: string): void {
  if (!existsSync(configFile)) return;
  const content = readFileSync(configFile, 'utf-8');
  const marker = '# branchdiff completion';
  if (!content.includes(marker)) return;
  const lines = content.split('\n');
  const filtered = lines.filter((line) => {
    if (line.includes(marker)) return false;
    if (line.trim() === 'eval "$(branchdiff completion zsh)"') return false;
    if (line.trim() === 'eval "$(branchdiff completion bash)"') return false;
    return true;
  });
  writeFileSync(configFile, filtered.join('\n'));
}

function installZsh(): void {
  ensureDir(ZSH_DIR);
  writeFileSync(ZSH_FILE, ZSH_SCRIPT);
  console.log(pc.green(`  Completion installed → ${ZSH_FILE}`));

  const zshrc = join(homedir(), '.zshrc');
  removeOldEvalLine(zshrc);

  if (existsSync(zshrc)) {
    const content = readFileSync(zshrc, 'utf-8');
    if (!content.includes('.zfunc')) {
      appendFileSync(zshrc, '\nfpath+=~/.zfunc\n');
      console.log(pc.dim('  Added fpath+=~/.zfunc to .zshrc'));
    }
  }

  console.log(pc.dim('  Restart your shell or run: exec zsh'));
}

function installBash(): void {
  ensureDir(BASH_DIR);
  writeFileSync(BASH_FILE, BASH_SCRIPT);
  console.log(pc.green(`  Completion installed → ${BASH_FILE}`));
  removeOldEvalLine(join(homedir(), '.bashrc'));
  console.log(pc.dim('  Restart your shell for completion to activate'));
}

export function registerCompletionCommand(program: Command): void {
  const cmd = program
    .command('completion')
    .description('Shell completion commands');

  cmd
    .command('install')
    .description('Install completion for your current shell')
    .action(() => {
      const shell = process.env.SHELL || '';
      if (shell.includes('zsh')) {
        installZsh();
      } else if (shell.includes('bash')) {
        installBash();
      } else {
        console.error(pc.red('Could not detect shell. Set $SHELL or use: branchdiff completion zsh|bash'));
        process.exit(1);
      }
    });

  cmd
    .command('zsh')
    .description('Print zsh completion script')
    .action(() => { process.stdout.write(ZSH_SCRIPT); });

  cmd
    .command('bash')
    .description('Print bash completion script')
    .action(() => { process.stdout.write(BASH_SCRIPT); });
}
