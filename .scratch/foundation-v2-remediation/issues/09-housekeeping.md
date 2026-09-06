# 09 — Housekeeping

**Status:** resolved 2026-09-06.

**Blocked by** 01. Independent of everything else.

## Why

Small things, none of which justify their own ticket, all of which cost more
later than now.

## What done looks like

- The fallback model name is current. The environment variable is the real
  control, but the fallback is what runs on a fresh clone, and it currently
  names a model generation that has moved on.
- The secrets check reports a readable message when a tracked file is missing
  from the working tree, instead of an unhandled error. It already fails
  closed, which is right; only the message is wrong.
- Configuration that exists for features not yet built is either removed or
  marked as planned, in place. An empty screens list and limits nothing reads
  are noise a future agent will try to honour.
- The Node version actually used locally and the one pinned for CI are either
  the same, or the difference is deliberate and written down.

## Notes

Resist expanding this. If one of these turns out to be more than a line, it
becomes its own ticket.

## Outcome

- `defaultModel` in `personalos.config.js`: `claude-sonnet-4-5` →
  `claude-sonnet-5`, the current generation.
- `scripts/check-secrets.js`: `statSync` on a tracked file is now wrapped in
  try/catch. A file `git ls-files` lists but that is missing on disk reports
  through the script's own `problems` list -- "tracked but missing from the
  working tree: `<path>`" -- and still exits 1, instead of an unhandled
  `ENOENT` stack trace. It already failed closed; only the presentation
  changes. No test harness exists for this script (it shells out to `git
  ls-files` against the real repo); verified by hand against a scratch git
  repo with a tracked-then-deleted file, and against the real repo
  unaffected.
- `limits` in `personalos.config.js`: dropped `classifyMaxTokens`. It was not
  read anywhere -- `lib/classify.js` hardcodes `max_tokens: 200` and always
  has -- so the config claimed a number (512) the code silently ignored,
  which is worse than an unused number: it is a wrong one. The other six
  fields are genuinely unread but not contradicted, each waiting on a named
  future card or route (Session, Health, Calendar, the memory search and
  answer-length limits for the not-yet-built Questions route); the block's
  own comment now says so and drops the claim that `docs/domain.md` explains
  them, which it does not -- grepped, zero mentions.
- `dashboard.screens` was already marked as planned in place ("Filled in
  when the screens are ported from the mockup") -- nothing to do there.
- Node version: `.nvmrc` (22) and `.github/workflows/verify.yml`
  (`node-version-file: .nvmrc`) already agree -- nothing to do there either.

`npm run verify` green on all four stages, 133 tests (unchanged; nothing
here is new domain behaviour).
