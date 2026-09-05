# 04 — A malformed data file fails loudly, naming itself

**Status:** resolved 2026-09-06.

**Blocked by** 01.

## Why

The document is parsed and cast to its type without any check of shape. A
truncated or hand-edited file therefore produces `undefined` where the types
promise an array, and the first card that maps over it dies with "cannot read
properties of undefined" — pointing at a component, never at the file.

That file is the only copy of the user's life. It should not be able to fail
quietly.

## What done looks like

- Reading a document missing a collection produces an error that names the
  file and the missing part, before any caller sees it.
- Reading a document from a future schema version is refused rather than
  half-understood.
- A test drives a truncated document through a read and asserts a useful
  error, not `undefined`.
- The check runs on read and stays cheap enough not to matter.

## Notes

Shape, not contents. This is a guard against a broken file, not a validation
framework, and it should not grow into one. Migration already handles old
versions; this is about documents that are not any version.

## Outcome

Two small checks, both in `lib/adapters/json/`:

- `assertKnownVersion(state, source)` in `migrations.js`: a document whose
  `schemaVersion` is greater than `CURRENT_SCHEMA_VERSION` is refused.
  `migrate()` only knows how to move forward; a document from a version
  newer than this code understands is not an old shape to upgrade, it is a
  shape nobody has written a migration for yet.
- `assertShape(state, source)` in `file.js`: checks that every collection
  `PersonalOsState` promises is present with the right JS type (array or
  object) -- nothing about what is inside them. Runs only against a document
  already at `CURRENT_SCHEMA_VERSION`, so it never has to understand an
  older shape: it runs after `migrate()` when a migration happened, or
  immediately when the document was already current. Both are the same
  handful of `typeof`/`Array.isArray` checks, cheap enough to run on every
  read without it mattering.

Both checks run in `readSeed()` too, not only on the working document --
parse() is the one place a raw document enters, so nothing about the two new
checks is specific to which file is being read.

`lib/adapters/json/file.js` gained no new export; `assertKnownVersion` is the
only new export, from `migrations.js`, since ticket 08 (or a future one) may
want it for the same reason at another call site.

Tests: `tests/store/malformed-file.test.js`, a new file following the
sandboxed-`DATA_DIR` pattern already used by `reset-backup.test.js` --
writes a hand-edited copy of the real seed straight to the working path
(missing collection, future schema version, wrong-typed `profile`) and
asserts `readState()` rejects, naming the file and the specific problem, for
each. All three were watched failing against the pre-fix code (the malformed
document was returned as-is) before the fix landed.

`npm run verify` green on all four stages, 136 tests (3 new).
