# 08 — The documentation describes the code as it is

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
