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

## Steps

1. **Record the anchors.** For every PR in the stack, bottom first, write
   down `number headRefName headRefOid` (`gh pr view <n> --json ...`). The
   **anchor** is that head SHA; branches vanish as the stack lands, the
   anchors do not. Write each anchor commit's body to a scratch file
   (`git log -1 --format=%b <anchor>`). Done when every PR has an anchor
   and a body file.

2. **Land one link**, for the parent at the bottom and its child:
   1. Parent is `CLEAN`, and its head has the anchor's tree:
      `git diff --quiet origin/<parent-branch> <anchor>`.
   2. Squash it with the anchor's own subject plus the PR number:
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

4. **Close out**: the ticket issues close through their PRs; close the
   parent spec issue as completed with a comment naming the PRs. Remove
   the repair worktree, fast-forward local `main`, delete the local
   branches.

## When it stops

- The repair script reports a **real conflict**: main changed a file after
  the stack was cut. Stop and resolve it as a merge, not with `--ours`.
- A **tree mismatch** at any proof: stop. Nothing has been pushed that
  differs from what was reviewed; find out why before going on.
