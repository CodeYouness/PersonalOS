#!/bin/bash
# Waits until a PR's pushed head has passed CI and the PR can merge.
#
# GitHub reports a PR CLEAN before CI has registered on a head just pushed:
# with no check run yet there is nothing to fail. Landing the #158 stack, a
# repaired child read CLEAN with an empty check list, and merging it then
# would have squashed a head CI never ran on. So this waits on the SHA you
# pushed, not on the PR's state alone.
#
#   scripts/wait-for-ci.sh <pr-number> <head-sha>
#
# Read-only: it calls gh and changes nothing. Exits 0 once the PR's head is
# <head-sha>, at least one check run exists on it, every one has completed
# as success, skipped or neutral, and the PR is CLEAN. Exits 1 on a failed
# check, a PR whose head has moved on, conflicts, or after
# WAIT_FOR_CI_TIMEOUT seconds (default 1200).
set -euo pipefail

PR=$1
SHA=$2
REPO=CodeYouness/PersonalOS
DEADLINE=$((SECONDS + ${WAIT_FOR_CI_TIMEOUT:-1200}))

# "<runs> <unfinished> <failed>" for the check runs on one commit.
COUNTS='.check_runs
  | "\(length) \([.[] | select(.status != "completed")] | length) \([.[] | select(.status == "completed" and (.conclusion | IN("success", "skipped", "neutral") | not))] | length)"'

seen="nothing yet"
while :; do
  head=$(gh pr view "$PR" --repo "$REPO" --json headRefOid --jq .headRefOid)
  # GitHub can take a moment to see a push; a head that differs from the
  # SHA is only an error once it is neither the SHA nor catching up to it.
  if [ "$head" = "$SHA" ]; then
    read -r runs unfinished failed < <(gh api "repos/$REPO/commits/$SHA/check-runs" --jq "$COUNTS")
    seen="$runs check runs, $unfinished unfinished"
    if [ "$failed" -gt 0 ]; then
      echo "PR #$PR: a check failed on $SHA:"
      gh api "repos/$REPO/commits/$SHA/check-runs" \
        --jq '.check_runs[] | select(.status == "completed") | "  \(.name): \(.conclusion)"'
      exit 1
    fi
    if [ "$runs" -gt 0 ] && [ "$unfinished" -eq 0 ]; then
      state=$(gh pr view "$PR" --repo "$REPO" --json mergeStateStatus --jq .mergeStateStatus)
      seen="CI passed, PR is $state"
      if [ "$state" = CLEAN ]; then
        echo "PR #$PR: CI passed on $SHA ($runs check runs), CLEAN"
        exit 0
      fi
      if [ "$state" = DIRTY ]; then
        echo "PR #$PR: CI passed on $SHA, but it conflicts with its base"
        exit 1
      fi
    fi
  elif git merge-base --is-ancestor "$SHA" "$head" 2>/dev/null; then
    echo "PR #$PR: its head $head is past $SHA -- wait on the new head instead"
    exit 1
  fi

  if [ "$SECONDS" -ge "$DEADLINE" ]; then
    echo "PR #$PR: timed out on $SHA (head $head): last saw $seen"
    exit 1
  fi
  sleep 10
done
