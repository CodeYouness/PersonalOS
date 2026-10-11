# 0027. A memory is accepted from one entry, and goes with it

- **Status** accepted
- **Date** 2026-10-11

## Context

ADR 0007 split the journal from memory and made provenance mandatory: a
memory whose `source` is not `user` carries a `derived_from` link to what it
was read from. It settled one direction -- deleting a memory never touches
the journal -- and left the other open. The Journal screen (#13) is where
memories are first drawn from journal entries, so it has to be closed.

The store had already answered it badly. Deleting a journal entry removed
every link touching it, so the seed's `memory_seed_2` would have outlived
`journal_seed_1` as a `source: journal` memory with no `derived_from` -- the
exact orphan ADR 0007 forbids, and the store only checks the rule on create.

Three questions came with it: what happens to a memory when its entry
changes or goes, whether the model's proposals are kept before you decide,
and what a memory you accepted claims about its own certainty.

## Decision

**Extraction reads one entry, when you ask.** Each proposal derives from
that entry alone, so provenance is exact and a lock on one entry never
reaches its siblings.

**Proposals are never stored.** They live in the response on screen.
Accepting one writes a memory; anything left undecided is gone on reload,
and asking again costs one model call.

**Accepting sets confidence to 1.** `source` stays `journal`, `validFrom` is
the entry's `date`, `validUntil` is open, and the only link is
`derived_from`. The model's own confidence orders the proposals and is not
kept.

**Deleting an entry deletes the memories drawn from it**, and the
confirmation says how many. A reading does not outlive what it read.

**An entry's text is fixed while a memory derives from it.** Correcting it
means deleting that memory first. Correcting an entry that has none throws
away its proposals on screen, so a memory always quotes what its entry says
now.

## Consequences

- Every memory with `source: journal` can answer "where did you get that?"
  with an entry that still exists and still says it.
- This is not how capture behaves: Undo keeps a capture's memory entry,
  because the capture itself stays. The rule is the same -- a memory goes
  only when its origin goes -- and only the origin's lifetime differs.
- Do not store proposals to "survive a reload". A stored proposal is a claim
  nobody confirmed sitting next to real memories, and every memory read --
  `buildContext` first -- would have to filter it out. The lost click is the
  price, on purpose.
- Confidence below 1 is reserved for claims the system holds without your
  confirmation, which today means none. Automatic extraction, if it comes,
  is what will write them.
- Discarded proposals are not remembered, so asking again may bring one
  back. Remembering a refusal would be storing proposals by another name.
