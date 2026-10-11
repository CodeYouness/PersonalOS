#!/bin/bash
# Prints the squash body for one PR of a stack (/land-stack, step 1): the
# first commit's body, an "Also: <subject>" line per later commit, then the
# trailers of every commit (Co-Authored-By), once each and last, so GitHub
# still reads them as trailers.
#
#   scripts/squash-message.sh <first-sha> [<later-sha> ...] > <body-file>
#
# Git only, read-only.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: scripts/squash-message.sh <first-sha> [<later-sha> ...] > <body-file>" >&2
  exit 1
fi
FIRST=$1
shift

trailers=$(for commit in "$FIRST" "$@"; do
  git log -1 --format='%(trailers:only,unfold)' "$commit"
done | sed '/^$/d' | awk '!seen[$0]++')

body=$(git log -1 --format=%b "$FIRST")
if [ -n "$trailers" ]; then
  body=$(grep -vxF -f <(printf '%s\n' "$trailers") <<<"$body" || true)
fi
# Trailing blank lines, left where the trailers were.
body=$(printf '%s\n' "$body" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}')

also=$(for commit in "$@"; do echo "Also: $(git log -1 --format=%s "$commit")"; done)

# The non-empty paragraphs, one blank line between them.
first=true
for paragraph in "$body" "$also" "$trailers"; do
  [ -n "$paragraph" ] || continue
  $first || echo
  printf '%s\n' "$paragraph"
  first=false
done
