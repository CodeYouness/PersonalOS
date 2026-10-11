#!/bin/bash
# Prints the squash body for one PR of a stack (/land-stack, step 1).
#
# The squash names the ticket, not the review fix that came after it: the
# body is the first commit's, then one "Also: <subject>" line per later
# commit, then the first commit's trailers (Co-Authored-By), kept last so
# GitHub still reads them as trailers.
#
#   scripts/squash-message.sh <first-sha> [<later-sha> ...] > <body-file>
#
# The subject is the first commit's own: git log -1 --format=%s <first-sha>.
# Git only, read-only.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: scripts/squash-message.sh <first-sha> [<later-sha> ...] > <body-file>" >&2
  exit 1
fi
FIRST=$1
shift

trailers=$(git log -1 --format='%(trailers:only,unfold)' "$FIRST" | sed '/^$/d')
body=$(git log -1 --format=%b "$FIRST")
if [ -n "$trailers" ]; then
  body=$(grep -vxF -f <(printf '%s\n' "$trailers") <<<"$body" || true)
fi
# Trailing blank lines, left where the trailers were.
body=$(printf '%s\n' "$body" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}')

printf '%s\n' "$body"
if [ "$#" -gt 0 ]; then
  echo
  for commit in "$@"; do
    echo "Also: $(git log -1 --format=%s "$commit")"
  done
fi
if [ -n "$trailers" ]; then
  echo
  printf '%s\n' "$trailers"
fi
