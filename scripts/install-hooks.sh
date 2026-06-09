#!/usr/bin/env sh
# Install the git hooks in this repository into .git/hooks/.
# Run once after cloning: sh scripts/install-hooks.sh

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"

install() {
  src="$1"
  dest="$HOOKS_DIR/$(basename "$1")"
  cp "$src" "$dest"
  chmod +x "$dest"
  echo "Installed $dest"
}

install "$REPO_ROOT/scripts/pre-commit"

echo ""
echo "Git hooks installed. The console-output lint will run on every commit."
