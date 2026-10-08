#!/bin/bash
# Repairs a stacked PR's branch after its parent was squash-merged.
#
# The child still carries the parent's original commits while main holds one
# squashed commit, so GitHub reports conflicts on every file both touched.
# They are artifacts: this merges origin/main into the child, takes the
# child's side only for files where main is identical to the parent's old
# head, and proves the result before anything is pushed.
#
#   scripts/repair-stacked-child.sh <child-head-sha> <parent-anchor-sha>
#
# Git only, never pushes. On success it prints the merge commit to push:
#   git -C <worktree> push origin HEAD:refs/heads/<child-branch>
set -euo pipefail

CHILD_HEAD=$1
PARENT_ANCHOR=$2
REPO=$(git rev-parse --show-toplevel)
WORKTREE=${TMPDIR:-/tmp}/personalos-repair

cd "$REPO"
git fetch -q origin
git worktree remove --force "$WORKTREE" 2>/dev/null || true
git worktree add -q --detach "$WORKTREE" "$CHILD_HEAD"
cd "$WORKTREE"

# The reference: the child's own commits replayed onto main.
git rebase -q --onto origin/main "$PARENT_ANCHOR"
REBASED=$(git rev-parse 'HEAD^{tree}')

git checkout -q --detach "$CHILD_HEAD"
git merge -q --no-edit origin/main >/dev/null 2>&1 || true
for file in $(git diff --name-only --diff-filter=U); do
  if git diff --quiet "$PARENT_ANCHOR" origin/main -- "$file"; then
    git checkout --ours -- "$file"
    git add -- "$file"
  else
    echo "real conflict in $file: main changed it since the parent's head" >&2
    exit 1
  fi
done
git -c core.editor=true commit -q --no-edit 2>/dev/null || true

MERGED=$(git rev-parse 'HEAD^{tree}')
ORIGINAL=$(git rev-parse "$CHILD_HEAD^{tree}")
if [ "$MERGED" != "$REBASED" ] || [ "$MERGED" != "$ORIGINAL" ]; then
  echo "tree mismatch: merge $MERGED, rebase $REBASED, child $ORIGINAL" >&2
  exit 1
fi
echo "trees match; push with:"
echo "  git -C $WORKTREE push origin HEAD:refs/heads/<child-branch>"
