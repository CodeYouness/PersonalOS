#!/bin/bash
# Waits until a PR's pushed head has passed CI and the PR can merge
# (/land-stack, step 2.7).
#
# GitHub reports a PR CLEAN before CI has registered on a head just pushed:
# with no check run yet there is nothing to fail. Landing the #158 stack, a
# repaired child read CLEAN with an empty check list. So this waits on the
# SHA you pushed, not on the PR's state alone.
#
#   scripts/wait-for-ci.sh <pr-number> <head-sha>     (abbreviated is fine)
#
# Read-only: it only calls gh (and git rev-parse). Exits 0 once at least one check run exists on
# <head-sha>, every one has completed as success, skipped or neutral, and
# the PR is CLEAN. Exits 1 on a failed check, conflicts, a PR head that is
# still not <head-sha> after a minute, or WAIT_FOR_CI_TIMEOUT seconds
# (default 1200). A gh call that fails -- a network blip -- is retried.
set -uo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: scripts/wait-for-ci.sh <pr-number> <head-sha>" >&2
  exit 1
fi
PR=$1
# The PR's head and the check runs are compared as full SHAs, and `git push`
# prints an abbreviated one: resolve it here. A SHA this clone does not know
# is used as given, and the head check below says so.
SHA=$(git rev-parse --verify --quiet "$2^{commit}" 2>/dev/null || echo "$2")
REPO=CodeYouness/PersonalOS
DEADLINE=$((SECONDS + ${WAIT_FOR_CI_TIMEOUT:-1200}))
# How long GitHub may take to see the push before a different head is an error.
HEAD_GRACE=$((SECONDS + 60))

# "<runs> <unfinished> <failed>" for the check runs on one commit.
COUNTS='.check_runs
  | "\(length) \([.[] | select(.status != "completed")] | length) \([.[] | select(.status == "completed" and (.conclusion | IN("success", "skipped", "neutral") | not))] | length)"'

seen="nothing yet"
while :; do
  if ! head=$(gh pr view "$PR" --repo "$REPO" --json headRefOid --jq .headRefOid); then
    seen="gh pr view failed, retrying"
  elif [ "$head" != "$SHA" ]; then
    seen="PR head $head"
    if [ "$SECONDS" -ge "$HEAD_GRACE" ]; then
      echo "PR #$PR: its head is $head, not $SHA -- wait on the head you pushed" >&2
      exit 1
    fi
  elif ! counts=$(gh api "repos/$REPO/commits/$SHA/check-runs" --jq "$COUNTS"); then
    seen="gh api check-runs failed, retrying"
  else
    read -r runs unfinished failed <<<"$counts"
    seen="$runs check runs, $unfinished unfinished"
    if [ "$failed" -gt 0 ]; then
      echo "PR #$PR: a check failed on $SHA:" >&2
      gh api "repos/$REPO/commits/$SHA/check-runs" \
        --jq '.check_runs[] | select(.status == "completed") | "  \(.name): \(.conclusion)"' >&2
      exit 1
    fi
    if [ "$runs" -gt 0 ] && [ "$unfinished" -eq 0 ]; then
      if state=$(gh pr view "$PR" --repo "$REPO" --json mergeStateStatus --jq .mergeStateStatus); then
        seen="CI passed, PR is $state"
        if [ "$state" = CLEAN ]; then
          echo "PR #$PR: CI passed on $SHA ($runs check runs), CLEAN"
          exit 0
        fi
        if [ "$state" = DIRTY ]; then
          echo "PR #$PR: CI passed on $SHA, but it conflicts with its base" >&2
          exit 1
        fi
      fi
    fi
  fi

  if [ "$SECONDS" -ge "$DEADLINE" ]; then
    echo "PR #$PR: timed out on $SHA: last saw $seen" >&2
    exit 1
  fi
  sleep 10
done
