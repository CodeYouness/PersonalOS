---
name: land-stack
description: Squash-merge a stack of one-ticket PRs into main, bottom-up, without closing or breaking the children.
disable-model-invocation: true
---

# Land a stack

A feature ships as a **stack**: one PR per ticket, each based on the branch
of the one before. CLAUDE.md squashes on merge, which breaks a stack two
ways: deleting a merged branch closes its child PR, and the child then
shows conflicts on every file it shares with the squashed parent. This is
the procedure that lands one cleanly, proven on four stacks by hand.

## Commands

Auto mode refuses a merge it cannot match to an allow rule. The rules in
`.claude/settings.local.json` match only a **plain single command**: no
`$(...)`, no `&&` chain, no wrapper script around `gh`. Write each PR body
to a file and pass `--body-file`; pass `--repo CodeYouness/PersonalOS`.

## Before landing: fixing a lower link

A review finding that belongs to a lower ticket is committed on that
ticket's branch, and the links above it are moved onto it. Name the old
head of the fixed branch as the `--onto` base, so only the commits above it
are replayed:

```
git rebase --update-refs --onto <fixed-branch> <its-old-head> <top-branch>
```

Without `--onto`, a plain rebase replays every commit below the fix again
too, and conflicts on files they already share. Done when
`git log --oneline main..<top-branch>` shows each ticket's commits once, in
order, and `npm run verify` passes on every branch.

## Steps

1. **Record the anchors.** For every PR in the stack, bottom first, write
   down `number headRefName headRefOid` (`gh pr view <n> --json ...`). The
   **anchor** is that head SHA; branches vanish as the stack lands, the
   anchors do not. Write each anchor commit's body to a scratch file
   (`git log -1 --format=%b <anchor>`). A PR that carries a review fix has
   more than one commit: its subject and body are its **first** commit's,
   with an `Also: <subject>` line per later commit, so the squash names the
   ticket and not the fix. Done when every PR has an anchor, a subject and
   a body file.

2. **Land one link**, for the parent at the bottom and its child:
   1. Parent is `CLEAN`, and its head has the anchor's tree:
      `git diff --quiet origin/<parent-branch> <anchor>`.
   2. Squash it with that subject plus the PR number:
      `gh pr merge <n> --squash --subject "<anchor subject> (#<n>)" --body-file <file>`.
      Never `--delete-branch`.
   3. Retarget the child: `gh pr edit <child> --base main`.
   4. Fetch, and prove main is the parent:
      `git diff --quiet origin/main <anchor>`.
   5. Check the child's `mergeable`. Only if `CONFLICTING`:
      `scripts/repair-stacked-child.sh <child-head> <parent-anchor>`,
      then push its printed command on its own line. A docs-only parent
      often leaves the child `MERGEABLE`; then skip the repair.
   6. Delete the parent branch: `git push origin --delete <parent-branch>`.
   7. Wait until the child is `CLEAN` with CI passing on its new head
      (poll `mergeStateStatus`; `gh run watch` can latch onto the previous
      run).

   Done when the child is `CLEAN` and based on `main`. Repeat for the next
   link; the last PR lands with 2.1, 2.2, 2.4 and 2.6.

3. **Prove the whole stack**: `git diff --quiet origin/main <top anchor>`.
   Main must be byte-identical to the top of the stack.

4. **Close out**: the ticket issues close through their PRs. Close the
   parent spec issue as completed, with a comment naming the PRs, in two
   plain commands (`gh issue close` has no `--comment-file`):
   `gh issue comment <n> --repo CodeYouness/PersonalOS --body-file <file>`, then
   `gh issue close <n> --repo CodeYouness/PersonalOS --reason completed`.
   Read each command's whole output: a failure piped through `tail` looks
   like success. Remove
   the repair worktree, fast-forward local `main`, delete the local
   branches.

## When it stops

- The repair script reports a **real conflict**: main changed a file after
  the stack was cut. Stop and resolve it as a merge, not with `--ours`.
- A **tree mismatch** at any proof: stop. Nothing has been pushed that
  differs from what was reviewed; find out why before going on.
