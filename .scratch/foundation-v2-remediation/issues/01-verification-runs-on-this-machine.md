# 01 — `npm run verify` runs end to end on this machine

**Status:** resolved 2026-09-03.

**Blocked by** nothing. This blocks every other ticket.

## Why

`node_modules` was installed inside a Linux VM and the project runs on
darwin/arm64. Vitest fails at startup on a missing native binding, so verify
exits after typecheck: the tests and the build never run, and the command
still looks like it did something.

Until this is fixed, no result from any other ticket can be trusted.

## What done looks like

- `npm run verify` completes all four stages and the test count is visible in
  the output.
- The number of passing tests is recorded in the commit message, so the
  baseline is written down somewhere other than a terminal.
- `npm run check:secrets` passes.
- If any test fails once it can actually run, that failure is a finding: stop
  and report it rather than fixing it inside this ticket.

## Notes

The lockfile already lists the platform bindings as optional, and CI on
ubuntu-latest is unaffected. Nothing in the repository is wrong; the installed
tree is. Commit a regenerated lockfile on its own if one appears.

## Outcome

`vitest` 4 runs on rolldown, and the tree held only `@rolldown/binding-*` for
Linux (and `@next/swc-linux-arm64-gnu`). `rm -rf node_modules && npm install`
on darwin/arm64 was the whole fix. `package-lock.json` did not change: the
lockfile was already correct and the installed tree was not, so there is no
regenerated lockfile to commit.

Observed on this machine:

- lint, typecheck, **96 tests passing in 7 files**, and `next build` -- all
  four stages of `npm run verify`.
- `npm run check:secrets` passes, 82 tracked files.
- No test failed, so there is no finding to report.

Two install scripts stayed blocked by npm's allow-scripts policy, `fsevents`
(file-watch performance only) and `unrs-resolver`. Neither stops any stage of
verify. Left alone: enabling them is a decision about this machine's npm
policy, not part of this ticket.
