#!/usr/bin/env bash
# Release script for `branchdiff` (unscoped npm package, lives in packages/cli/).
#
# Usage:
#   scripts/release/release.sh patch    # 0.1.0 → 0.1.1
#   scripts/release/release.sh minor    # 0.1.0 → 0.2.0
#   scripts/release/release.sh major    # 0.1.0 → 1.0.0
#
# What it does:
#   1. Bumps version in packages/cli/package.json (no git tag yet)
#   2. Commits the bump
#   3. Creates annotated tag vX.Y.Z
#   4. Pushes branch + tag to the GitHub remote
#   5. GitHub Actions picks up the tag and publishes to npm
#
# Pre-flight checks:
#   - working tree clean
#   - on master branch (override with RELEASE_ALLOW_BRANCH=1)
#   - pnpm build succeeds

set -euo pipefail

BUMP="${1:-}"
if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Usage: $0 <patch|minor|major>" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLI_DIR="$REPO_ROOT/packages/cli"

cd "$REPO_ROOT"

# 1. Clean tree check
if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ Working tree not clean. Commit or stash changes first." >&2
  git status --short
  exit 1
fi

# 2. Branch check
CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "master" && "${RELEASE_ALLOW_BRANCH:-0}" != "1" ]]; then
  echo "✗ Not on master (current: $CURRENT_BRANCH)." >&2
  echo "  Override: RELEASE_ALLOW_BRANCH=1 $0 $BUMP" >&2
  exit 1
fi

# 3. Detect GitHub remote
REMOTE=""
for r in origin upstream; do
  if git remote get-url "$r" >/dev/null 2>&1; then
    if git remote get-url "$r" | grep -qi "github.com.*branchdiff"; then
      REMOTE="$r"
      break
    fi
  fi
done
if [[ -z "$REMOTE" ]]; then
  echo "✗ No git remote points to the branchdiff GitHub repo." >&2
  exit 1
fi
echo "• Using remote: $REMOTE"

# 4. Current + next version
CURRENT="$(node -p "require('$CLI_DIR/package.json').version")"
IFS='.' read -r major minor patch <<<"$CURRENT"
case "$BUMP" in
  patch) NEXT="$major.$minor.$((patch + 1))" ;;
  minor) NEXT="$major.$((minor + 1)).0" ;;
  major) NEXT="$((major + 1)).0.0" ;;
esac
TAG="v$NEXT"

echo "• Current: $CURRENT"
echo "• Next:    $NEXT"
echo "• Tag:     $TAG"
echo "• Remote:  $REMOTE"
echo
read -r -p "Proceed? [y/N] " ans
[[ "$ans" =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }

# 5. Local build smoke test before tagging
echo "→ pnpm build (local smoke test)"
pnpm run build >/dev/null

# 6. Bump version in packages/cli only
echo "→ Bumping packages/cli/package.json"
(cd "$CLI_DIR" && npm version "$NEXT" --no-git-tag-version >/dev/null)

# 7. Commit
git add packages/cli/package.json
git commit -m "chore(release): v$NEXT"

# 8. Delete stale local/remote tag if retry
if git tag -l "$TAG" | grep -q "$TAG"; then
  echo "→ Removing stale local tag $TAG"
  git tag -d "$TAG" >/dev/null
fi
if git ls-remote --tags "$REMOTE" "refs/tags/$TAG" | grep -q "$TAG"; then
  echo "→ Removing stale remote tag $TAG"
  git push "$REMOTE" ":refs/tags/$TAG" >/dev/null
fi

# 9. Tag
git tag -a "$TAG" -m "Release $TAG"

# 10. Push
echo "→ Pushing branch $CURRENT_BRANCH to $REMOTE"
git push "$REMOTE" "$CURRENT_BRANCH"
echo "→ Pushing tag $TAG to $REMOTE"
git push "$REMOTE" "$TAG"

echo
echo "✓ Pushed $TAG to $REMOTE. GitHub Actions will now publish."
echo "  https://github.com/Encryptioner/branchdiff/actions"
echo "  https://www.npmjs.com/package/@encryptioner/branchdiff"
