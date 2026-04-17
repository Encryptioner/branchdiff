#compdef branchdiff
# branchdiff shell completion

_branchdiff() {
  local curcontext="$curcontext" state line
  local -a branches

  branches=(${(f)"$(git branch -a 2>/dev/null | sed 's/^[* ]*//' | grep -v ' -> ' | grep -v HEAD | sed 's|remotes/||')"})
  branches+=(staged unstaged HEAD .)

  local -a subcommands
  subcommands=(
    'tree:Browse repository files'
    'list:List running instances'
    'kill:Stop running instances'
    'prune:Remove all branchdiff data'
    'update:Check for updates'
    'doctor:Check branchdiff setup'
    'open:Open running instance in browser'
    'completion:Shell completion commands'
  )

  _arguments -C \
    '1: :->first' \
    '2: :->second' \
    '*::arg:->rest' \
    '--base[Base ref]:ref:->ref' \
    '--compare[Compare ref]:ref:->ref' \
    '--mode[Diff mode]:mode:(file git)' \
    '--port[Port]:port:' \
    '--no-open[Do not open browser]' \
    '--quiet[Minimal output]' \
    '--dark[Dark mode]' \
    '--unified[Unified view]' \
    '--new[Force restart]'

  case $state in
    first)
      _describe 'command' subcommands
      _describe 'branch' branches
      ;;
    second)
      case $words[1] in
        completion) _values 'action' 'install[Auto-install]' 'zsh[Print zsh script]' 'bash[Print bash script]' ;;
        tree|list|kill|prune|update|doctor|open) ;;
        *) _describe 'branch' branches ;;
      esac
      ;;
    ref)
      _describe 'branch' branches
      ;;
  esac
}

_branchdiff "$@"
