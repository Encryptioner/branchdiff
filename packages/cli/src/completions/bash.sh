# branchdiff shell completion
_branchdiff() {
  local cur prev words cword
  _init_completion || return

  local branches
  branches=$(git branch -a 2>/dev/null | sed 's/^[* ]*//' | grep -v ' -> ' | grep -v HEAD | sed 's|remotes/||')
  branches="$branches staged unstaged HEAD ."

  local commands="tree list kill prune update doctor open completion"

  case $prev in
    --mode) COMPREPLY=($(compgen -W "file git" -- "$cur")); return ;;
    --base|--compare) COMPREPLY=($(compgen -W "$branches" -- "$cur")); return ;;
    --port) return ;;
  esac

  if [ "$cword" -eq 1 ]; then
    COMPREPLY=($(compgen -W "$commands $branches" -- "$cur"))
    return
  fi

  case ${words[1]} in
    completion) COMPREPLY=($(compgen -W "install zsh bash" -- "$cur")); return ;;
    tree|list|kill|prune|update|doctor|open) return ;;
  esac

  COMPREPLY=($(compgen -W "$branches" -- "$cur"))
}

complete -F _branchdiff branchdiff
