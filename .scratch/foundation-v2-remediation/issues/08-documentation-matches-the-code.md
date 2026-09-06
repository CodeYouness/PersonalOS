# 08 — The documentation describes the code as it is

**Status:** resolved 2026-09-06.

**Blocked by** 02, 06, 07 — those change what is true.

## Why

Several statements in the docs are now false, and a future agent will build on
them. Documentation drift is the failure this project has explicitly promised
not to have: the repository is the operational source of truth, and a document
that describes an intention as a fact is worse than no document.

Note that an external review flagged more contradictions than remain; some
were fixed by Foundation v2. Verify each against the code before changing a
word. The handoff note lists which ones are already stale.

## What done looks like

Each of these either matches the code or is marked explicitly as not yet
implemented:

- the claim about when the single-writer assumption breaks
- the claim that nothing but the data layer reaches storage
- the testing section, which describes classification tests and route-handler
  tests that do not exist, in the present tense
- the layer table, which omits a dependency the health route actually has
- where components are allowed to live, stated one way in one document and
  another way in a second
- the reset command described as an undo

## Notes

Sentence-level corrections, not a rewrite. The structure of these documents is
good and should survive.

Anything not yet built gets marked as such in place. A reader must never have
to guess whether a paragraph is a description or a plan.

## Outcome

Checked each of the six claims against the code on the current `main`
(02, 06, 07 already merged). Three were already true and untouched:

- The single-writer claim — `docs/architecture.md` was already corrected by
  ticket 02.
- The reset command described as an undo — `README.md` was already corrected
  by ticket 07; `scripts/reset-data.js`'s own docstring already says "Not an
  undo".
- "Nothing but the data layer reaches storage" — verified true: grepped the
  whole tree for imports of `lib/adapters/*` outside `lib/store.js` and
  found none (ticket 07 closed the one bypass, `scripts/reset-data.js`).

Three needed a sentence-level fix:

- `docs/development.md`'s testing section said route handlers are "called as
  functions with a fake store" — `tests/app/capture-route.test.js` actually
  uses a real store pointed at a sandboxed temp `DATA_DIR`, not a fake one.
  Reworded to match. (The tests themselves already existed — the earlier
  claim that classification and route-handler tests "do not exist" was
  itself stale; `tests/lib/classify.test.js` and
  `tests/app/capture-route.test.js` were both added by #11.)
- The layer table in `docs/architecture.md` listed `lib/store.js`,
  `lib/domain/` and config as what `app/` may depend on, omitting
  `lib/domain/derive/` — but `app/api/health/route.js` imports
  `lib/domain/derive/finance.js` and `derive/tasks.js` directly, and the
  same document's own "Data flow, concretely" section already describes
  routes calling `derive/`. Added it to the table.
- `CLAUDE.md`'s Layout section claimed `app/` is "the only place that may use
  `@/`", contradicting `docs/architecture.md` ("the alias belongs to `app/`
  and `components/`") and the actual code (`components/TodayCard.js`,
  `CaptureBar.js`, `SessionCard.js` all use it). `components/` wasn't even
  listed. Added a `components/` row and dropped the exclusivity claim from
  `app/`. Code review (Spec axis) caught a third document with the same
  narrower claim that the first pass missed: `docs/roadmap.md`'s "`app/` may
  use `@/`" line, fixed the same way.

Also removed, as unrelated one-line housekeeping found while checking the
test claim above: an untracked, byte-identical duplicate
`tests/store/malformed-file.test 2.js` (stray sync/editor artifact; harmless
to `vitest` since the glob doesn't match the trailing " 2.js", but noise).

`npm run verify` green (lint, typecheck, 152 tests, build) — no test count
change, this ticket touches no runtime code.
