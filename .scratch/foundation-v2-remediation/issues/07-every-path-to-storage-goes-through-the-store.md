# 07 — Every path to storage goes through the data layer

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
