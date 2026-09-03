# Handoff — Foundation v2, and what is still broken

Written 2026-09-03, at the end of the session that built Foundation v2 and
immediately before the project moves to Claude Code. Anyone picking this up
should be able to continue from this file plus `docs/` alone. Nothing here
depends on remembering a conversation.

## Where the project is

Foundation v2 is committed and pushed (`b1ec3aa`). The data model can now
represent a life graph: links, events, journal, typed memory, finance
accounts / observations / transactions / snapshots, a schema migration, and
an integration contract with no integration behind it.

`docs/roadmap.md` says what exists and what is next. `docs/decisions/` holds
ten ADRs. Read `CLAUDE.md` first — it is short and holds the seven rules that
are not negotiable.

## The thing that must be understood before touching anything

**The test suite has never run on the developer's machine.** `node_modules`
was installed inside a Linux VM by the agent that built the bootstrap, and the
project lives on a darwin/arm64 Mac. `vitest` fails at startup with a missing
native binding, so `npm run verify` exits before the tests and before the
build, while lint and typecheck report green.

That means: **a green `verify` on this machine currently proves almost
nothing.** The 96 tests did pass, on Linux, during the build session. They
have not been observed passing here. Ticket 01 exists to fix that and it
blocks everything else, because until it is done no other result is
trustworthy.

**Resolved 2026-09-03 by ticket 01.** `node_modules` was reinstalled on
darwin/arm64; `npm run verify` now completes all four stages and 96 tests are
observed passing here. The paragraph above is kept because it explains why the
tickets are ordered the way they are -- not because it is still true.

## The bug that matters

`updateState` in the JSON adapter is a read-modify-write with no
serialisation, and the temporary file it writes through is named after the
process id — the same name for every concurrent write in the same process.

Two overlapping writes therefore either lose one silently or crash with
ENOENT on rename. This is reachable with two overlapping HTTP requests in a
single Next.js process: the capture bar saving while a card refreshes. It is
the normal case, not an exotic one.

It also contradicts `docs/architecture.md`, which claims the single-writer
assumption only breaks "the day you write from a phone and a laptop at once".
That sentence is wrong and Ticket 02 replaces it.

This directly violates rule 2 in `CLAUDE.md`: *capture never fails; at worst
it files badly.* Right now capture can fail and take data with it.

## An external review was run, and it was run against the wrong commit

A second model reviewed the repository and produced a detailed report. It is
good work and its two CRITICAL findings are real. But it was taken against
commit `1c5aea2` — the bootstrap, before Foundation v2 — so roughly a third of
it describes problems that no longer exist.

Already fixed in v2, and to be ignored if the report resurfaces:

- `version` is unread and there is no migration → `schemaVersion` is read on
  every load, `migrate()` is pure and idempotent, and the old file is copied
  aside before rewriting.
- No `Snapshot` type or operations → `NetWorthSnapshot` exists, with
  `getSnapshots` and `recordSnapshot` in the contract.
- `domain.md` describes an overdue derivation that does not exist → it exists
  in `lib/domain/derive/tasks.js`, and the seed no longer stores `overdue`.
- `Activity` entries → renamed to `Event`, typed, with a day key.
- Tooling state not ignored → `.claude-flow/` and `.claude/proven-config.json`
  are in `.gitignore`.
- `updateTask` accepts `band: 'overdue'` → `URGENCY_BANDS` no longer contains
  it, so it is rejected. The other half of that finding stands: unknown fields
  still pass through untouched.

The report also proposes numbering a new ADR 0006. That number is taken. The
next free one is **0011**.

The lesson worth keeping: a reviewer without the ADRs in context will flag
deliberate decisions as defects. The persisted net worth snapshot, the absence
of foreign keys, the empty integration registry and the alias asymmetry
between `lib/` and `app/` are all decisions with an ADR. Read the ADR before
"fixing" any of them.

## Open threads that are not defects

- **The xlsx transaction importer.** The model is ready:
  `upsertTransactionByOrigin` matches on `(source, externalId)` and rewrites
  only source-owned fields, so a re-import never wipes a category set by hand.
  What is missing is the shape of the real spreadsheet, which the owner has
  and has not yet shared.
- **The mockup predates v2.** `design/mockup.html` is self-contained and its
  card ids are the contract for the port, but it was drawn before the habits
  screen and the period selectors had a data model. Revise before porting.
- **Deferred on purpose:** domain operations that do not exist yet
  (`addMeal`, `setHabit`, per-goal writes) should be added when the first card
  needs them, not designed in the abstract. Read caching only if measured.

## How to continue

Work the tickets in `.scratch/foundation-v2-remediation/issues/` in order.
01 unblocks verification; 02 is the data-loss bug; 06 blocks the mockup port.
03, 04, 05 and 08 are independent of each other.

The gate is `npm run verify`. Once ticket 03 lands it will mean something.
