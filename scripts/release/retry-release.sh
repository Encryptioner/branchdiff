#!/usr/bin/env bash
# Retry script for `branchdiff` — re-release the current version without bumping.
#
# Usage:
#   scripts/release/retry-release.sh              # Re-release current version
#   scripts/release/retry-release.sh <version>    # Re-release specific version (e.g. 1.0.0)
#
# What it does:
#   1. Confirms the version to re-release (from packages/cli/package.json or CLI arg)
#   2. Removes the release tag from local repo (if it exists)
#   3. Removes the release tag from GitHub (if it exists)
#   4. Re-creates the annotated tag
#   5. Pushes the tag to trigger GitHub Actions publish workflow again
#
# Use case:
#   - GitHub Actions publish failed but tag was created
#   - You want to retry the npm publish without bumping the version
#   - Testing the publish workflow

set -euo pipefail

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
  echo "  Override: RELEASE_ALLOW_BRANCH=1 $0 ${1:-}" >&2
  exit 1
fi

# 3. Get version to re-release
if [[ -n "${1:-}" ]]; then
  # Use provided version (strip leading 'v' if present)
  VERSION="${1#v}"
else
  # Use current version from package.json
  VERSION="$(node -p "require('$CLI_DIR/package.json').version")"
fi

TAG="v$VERSION"

# 4. Confirm version
echo "• Branch:                $CURRENT_BRANCH"
echo "• Version to re-release: $VERSION"
echo "• Tag:                   $TAG"
echo

# 5. Detect GitHub remote
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
echo "• Remote: $REMOTE"
echo

# 6. Check if tag exists locally or on remote
TAG_EXISTS_LOCAL="false"
TAG_EXISTS_REMOTE="false"

if git tag -l "$TAG" | grep -q "$TAG"; then
  TAG_EXISTS_LOCAL="true"
  echo "  ✓ Tag exists locally: $TAG"
fi

if git ls-remote --tags "$REMOTE" "refs/tags/$TAG" | grep -q "$TAG"; then
  TAG_EXISTS_REMOTE="true"
  echo "  ✓ Tag exists on remote: $TAG"
fi

if [[ "$TAG_EXISTS_LOCAL" == "false" && "$TAG_EXISTS_REMOTE" == "false" ]]; then
  echo "  ⚠ Tag does not exist locally or on remote. Creating fresh tag..."
fi

echo
read -r -p "Proceed with re-release? [y/N] " ans
[[ "$ans" =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }

# 7. Remove stale tags
if [[ "$TAG_EXISTS_LOCAL" == "true" ]]; then
  echo "→ Removing local tag $TAG"
  git tag -d "$TAG" >/dev/null
fi

if [[ "$TAG_EXISTS_REMOTE" == "true" ]]; then
  echo "→ Removing remote tag $TAG from $REMOTE"
  git push "$REMOTE" ":refs/tags/$TAG" >/dev/null
fi

# 8. Create fresh tag
echo "→ Creating annotated tag $TAG"
git tag -a "$TAG" -m "Release $TAG (retry)"

# 9. Push branch and tag
echo "→ Pushing branch $CURRENT_BRANCH to $REMOTE"
git push "$REMOTE" "$CURRENT_BRANCH"
echo "→ Pushing tag $TAG to $REMOTE"
git push "$REMOTE" "$TAG"

echo
echo "✓ Re-released $TAG to $REMOTE. GitHub Actions will now publish."
echo "  https://github.com/Encryptioner/branchdiff/actions"
echo "  https://www.npmjs.com/package/@encryptioner/branchdiff"
