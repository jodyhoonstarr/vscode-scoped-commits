#!/usr/bin/env bash
# Run once after `gh repo clone` to remove upstream tags and fix gh default repo.
# gh repo clone adds the upstream (vivaxy) remote automatically for forks and
# fetches all its tags into the local namespace. This undoes that.
set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "Deleting upstream tags..."
TAGS=$(git tag -l)
if [ -n "$TAGS" ]; then
  git tag -d $TAGS
  echo "Deleted $(echo "$TAGS" | wc -l | tr -d ' ') tags."
else
  echo "No tags to delete."
fi

echo "Configuring upstream remote to skip tag fetches..."
git config remote.upstream.tagOpt --no-tags

echo "Setting gh default repo to fork..."
git config remote.upstream.gh-resolved jodyhoonstarr/vscode-scoped-commits
gh repo set-default jodyhoonstarr/vscode-scoped-commits

echo "Done. To avoid this entirely next time, clone with:"
echo "  gh repo clone jodyhoonstarr/vscode-scoped-commits -- --no-upstream"
echo "  # or use the alias:"
echo "  gh clone-scoped"
