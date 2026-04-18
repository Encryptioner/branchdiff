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

function removeOldCompletionLines(configFile: string): void {
  if (!existsSync(configFile)) return;
  const content = readFileSync(configFile, 'utf-8');
  const lines = content.split('\n');
  const filtered = lines.filter((line) => {
    const t = line.trim();
    if (t === '# branchdiff completion') return false;
    if (t === 'eval "$(branchdiff completion zsh)"') return false;
    if (t === 'eval "$(branchdiff completion bash)"') return false;
    if (t.startsWith('fpath+=') && t.includes('.zfunc')) return false;
    if (t.startsWith('fpath=(') && t.includes('.zfunc')) return false;
    if (t === 'source ~/.zfunc/_branchdiff') return false;
    if (t === '[[ -f ~/.zfunc/_branchdiff ]] && source ~/.zfunc/_branchdiff') return false;
    return true;
  });
  writeFileSync(configFile, filtered.join('\n'));
}

function installZsh(): void {
  ensureDir(ZSH_DIR);
  writeFileSync(ZSH_FILE, ZSH_SCRIPT);
  console.log(pc.green(`  Completion installed → ${ZSH_FILE}`));

  const zshrc = join(homedir(), '.zshrc');
  removeOldCompletionLines(zshrc);

  if (existsSync(zshrc)) {
    const content = readFileSync(zshrc, 'utf-8');
    if (!content.includes('_branchdiff')) {
      appendFileSync(zshrc, '\n# branchdiff completion\nsource ~/.zfunc/_branchdiff\n');
      console.log(pc.dim('  Added completion source to .zshrc'));
    }
  }

  console.log(pc.dim('  Restart your shell or run: exec zsh'));
}

function installBash(): void {
  ensureDir(BASH_DIR);
  writeFileSync(BASH_FILE, BASH_SCRIPT);
  console.log(pc.green(`  Completion installed → ${BASH_FILE}`));
  removeOldCompletionLines(join(homedir(), '.bashrc'));
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
