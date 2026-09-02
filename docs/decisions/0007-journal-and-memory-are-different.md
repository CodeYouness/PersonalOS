# 0007. The journal and the memory are different things

- **Status** accepted
- **Date** 2026-09-02

## Context

The system needs somewhere to write freely at the end of a day, and it needs
something an AI can query about the person. The tempting move is to make them
the same store: every diary entry becomes a memory, and the memory is the
searchable archive.

That collapses two things that behave differently. What you wrote is a fact
about the past and must never change. What the system knows is an
interpretation — it can be wrong, it can be corrected, it can expire, and it
should carry a confidence.

If they are one store, an extraction that gets it wrong corrupts the record it
came from, and there is no way to go back and read what you actually said.

## Decision

Two entities.

**JournalEntry** is canonical: `date`, `text`, `tags`. Never rewritten by the
system. Several per day are allowed, because a morning thought and an evening
one are two things.

**MemoryEntry** is derived: `type` (fact, preference, decision, context,
observation, event), `content`, `confidence`, `validFrom`, `validUntil`,
`tags`.

And the rule that makes it work: **a memory whose `source` is not `user` must
carry a `derived_from` link to its origin.** The store rejects it otherwise.

Deleting a memory removes the memory and its links, and never touches the
journal entry it came from.

Journal is **not** added to `DESTINATIONS`. Writing a diary is not a sentence
that got filed somewhere.

## Consequences

- The original writing is always recoverable, whatever the AI did with it.
- The archive cannot fill with confident claims nothing backs. "Where did you
  get that?" always has an answer.
- Extraction can be automatic later without being dangerous, because a wrong
  extraction is a deletable memory rather than a corrupted diary.
- `validFrom` / `validUntil` are there because a preference can stop being
  true. Without a window, the system asserts a stale fact forever.
