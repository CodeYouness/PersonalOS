# 07 — Every path to storage goes through the data layer

**Status:** resolved 2026-09-06.

**Blocked by** 01.

## Why

`docs/architecture.md` says: nothing reaches storage except through the store
— not a component, not a route handler, not a script. The reset script does
exactly that, importing the adapter directly. It is the precedent the next
agent copies when it asks "how do I touch data from a script", and that is how
the most important rule in the project dies.

Two related weaknesses travel with it. The store re-exports adapter methods as
detached references, which works only because the current adapter never uses
`this`; an adapter written as a class would fail at runtime with an error
pointing nowhere near the cause. And the reset command is documented in three
places as "the undo button" when it is a destructive factory reset — an agent
that finds a data file in a strange state is currently authorised by the docs
to delete the user's life.

## What done looks like

- No module outside the data layer imports an adapter. Lint enforces it
  (ticket 03) and the reset script goes through the store.
- Whatever the script needs from the adapter that the store does not expose is
  added to the store as a domain operation, not reached around.
- An adapter that uses `this` still works, or the contract states plainly that
  it may not. Either is acceptable; silence is not.
- The reset command is named and described as what it is. If a real undo is
  wanted, that is a separate ticket, not a rename.

## Notes

ADR-0002 is the reference. It already says that wanting the raw document out
of the store is the signal a domain operation is missing.

## Outcome

`scripts/reset-data.js` now imports `resetToSeed` and a new `describeStorage`
from `lib/store.js`, not `resetState`/`workingPath` from
`lib/adapters/json/file.js` directly. `describeStorage()` is the domain
operation the script needed and the store did not expose: a new contract
method, `() => string`, returning a human-readable, safe-to-print location
for the active adapter's data (the JSON adapter returns its working file
path; a future adapter answers for itself). Added to `lib/adapters/contract.js`
alongside `reset`, to `ADAPTER_METHODS`, implemented in
`lib/adapters/json/index.js`, re-exported from `lib/store.js` the same way
every other operation is. Ran the script directly against a scratch
`DATA_DIR` to confirm it still restores and reports a backup correctly
through the new path.

On `this`: rather than rewrite `lib/store.js`'s fifty-odd
`export const x = adapter.x` lines to bind a method that nothing currently
needs bound, `lib/adapters/contract.js` now says plainly that an adapter
relying on `this` must bind its own methods before exporting them -- the
ticket's own "either is acceptable" allows this, and inventing the binding
now for a class that does not exist yet would be exactly the kind of
work-for-nothing this codebase avoids elsewhere.

The reset command is reworded away from "undo" in the three places it
appeared as one: `README.md`, the module header comment in
`lib/adapters/json/file.js`, and a test comment in
`tests/store/adapter-contract.js`. `docs/development.md` already described it
neutrally ("Restore ... from the seed, backing up whatever was there
first") and needed no change.

Left for ticket 03 to finish, not for here: `eslint.config.mjs`'s carve-out
for `scripts/reset-data.js` in the adapter-import rule is on a different,
not-yet-merged branch. Once these two land together, that exception has
nothing left to except and should come out.

`npm run verify` green on all four stages, 133 tests (unchanged -- this
ticket moves an import and adds one small, already-covered contract method,
not new domain behaviour).
