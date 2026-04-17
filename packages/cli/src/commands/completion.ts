import type { Command } from 'commander';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import pc from 'picocolors';
import { getBranches } from '@branchdiff/git';
import { isGitRepo } from '@branchdiff/git';

const MARKER = '# branchdiff completion';

function listBranches(): void {
  if (!isGitRepo()) return;
  const branches = getBranches();
  const specials = ['staged', 'unstaged', 'HEAD', '.'];
  const all = [...specials, ...branches];
  for (const name of all) {
    process.stdout.write(`${name}\n`);
  }
}

function zshScript(): string {
  return `#compdef branchdiff
${MARKER}
_branchdiff() {
  local -a commands refs modes
  commands=(
    'tree:Browse repository files'
    'list:List running instances'
    'kill:Stop all running instances'
    'prune:Remove all branchdiff data'
    'update:Check for updates'
    'doctor:Check branchdiff setup'
    'open:Open running instance in browser'
    'completion:Shell completion commands'
  )
  modes=('file' 'git')

  _arguments -C \\
    '1: :->cmd' \\
    '2: :->arg1' \\
    '3: :->arg2' \\
    '*::arg:->args'

  case $state in
    cmd)
      _describe 'command' commands
      _describe 'ref' _branchdiff_refs
      ;;
    arg1)
      case $words[1] in
        completion)
          _describe 'shell' '(zsh bash install)'
          ;;
        tree|list|kill|prune|update|doctor|open)
          ;;
        *)
          _describe 'ref' _branchdiff_refs
          ;;
      esac
      ;;
    arg2)
      case $words[1] in
        completion) ;;
        tree|list|kill|prune|update|doctor|open) ;;
        *)
          _describe 'ref' _branchdiff_refs
          ;;
      esac
      ;;
  esac

  case $words[CURRENT-1] in
    --mode) _describe 'mode' modes; return ;;
    --base|--compare) _describe 'ref' _branchdiff_refs; return ;;
  esac

  _arguments \\
    '--base[Base ref]:ref:_branchdiff_refs' \\
    '--compare[Compare ref]:ref:_branchdiff_refs' \\
    '--mode[Diff mode]:mode:(file git)' \\
    '--port[Port number]:port:' \\
    '--no-open[Do not open browser]' \\
    '--quiet[Minimal output]' \\
    '--dark[Dark mode]' \\
    '--unified[Unified view]' \\
    '--new[Force restart]'
}

_branchdiff_refs() {
  local -a refs
  refs=("\$(branchdiff completion --list-branches 2>/dev/null)")
  _describe 'ref' refs
}

compdef _branchdiff branchdiff
`;
}

function bashScript(): string {
  return `${MARKER}
_branchdiff_refs() {
  local cur="\$2"
  COMPREPLY=(\$(compgen -W "\$(branchdiff completion --list-branches 2>/dev/null)" -- "\$cur"))
}

_branchdiff_mode() {
  local cur="\$2"
  COMPREPLY=(\$(compgen -W "file git" -- "\$cur"))
}

_branchdiff() {
  local cur prev words cword
  _init_completion || return

  # Subcommands
  local commands="tree list kill prune update doctor open completion"

  if [ "$cword" -eq 1 ]; then
    COMPREPLY=(\$(compgen -W "\$commands \$(branchdiff completion --list-branches 2>/dev/null)" -- "\$cur"))
    return
  fi

  case $prev in
    --mode)
      _branchdiff_mode "$cur"
      return
      ;;
    --base|--compare)
      _branchdiff_refs "$cur"
      return
      ;;
    --port)
      return
      ;;
  fi

  # If first arg is a known subcommand, no further completion
  if echo "$commands" | grep -qw "$words[1]"; then
    case $words[1] in
      completion)
        COMPREPLY=(\$(compgen -W "zsh bash install" -- "$cur"))
        ;;
    esac
    return
  fi

  # Otherwise, complete refs for positional args
  _branchdiff_refs "$cur"
}

complete -F _branchdiff branchdiff
`;
}

function installCompletion(shell: string): void {
  const home = homedir();
  const configFile = shell === 'zsh' ? join(home, '.zshrc') : join(home, '.bashrc');

  if (!existsSync(configFile)) {
    console.log(pc.yellow(`  ${configFile} not found. Skipping auto-install.`));
    console.log(`  Add this line manually:`);
    console.log(`    ${pc.cyan(`eval "$(branchdiff completion ${shell})"`)}`);
    return;
  }

  const content = readFileSync(configFile, 'utf-8');
  if (content.includes('branchdiff completion')) {
    console.log(pc.dim(`  Completion already registered in ${configFile}`));
    return;
  }

  const line = `\n${MARKER}\neval "$(branchdiff completion ${shell})"\n`;
  appendFileSync(configFile, line);
  console.log(pc.green(`  Added completion to ${configFile}`));
  console.log(pc.dim(`  Restart your shell or run: source ${configFile}`));
}

export function registerCompletionCommand(program: Command): void {
  const cmd = program
    .command('completion')
    .description('Shell completion commands');

  cmd
    .command('zsh')
    .description('Print zsh completion script')
    .action(() => {
      process.stdout.write(zshScript());
    });

  cmd
    .command('bash')
    .description('Print bash completion script')
    .action(() => {
      process.stdout.write(bashScript());
    });

  cmd
    .command('install')
    .description('Auto-install completion for your current shell')
    .action(() => {
      const shell = process.env.SHELL || '';
      if (shell.includes('zsh')) {
        installCompletion('zsh');
      } else if (shell.includes('bash')) {
        installCompletion('bash');
      } else {
        console.error(pc.red('Could not detect shell. Use: branchdiff completion zsh or bash'));
        process.exit(1);
      }
    });

  // Hidden internal flag for completion scripts to call
  cmd
    .option('--list-branches', 'List branches for completion (internal)', false)
    .action((opts) => {
      if (opts.listBranches) {
        listBranches();
        return;
      }
      cmd.help();
    });
}
