# 0013. A capture can be corrected after filing

- **Status** accepted
- **Date** 2026-09-07

## Context

Every other write-once fact in this system stays write-once: journal entries
are "never rewritten by the system" (rule 7), events are "append-only, nothing
edits an event." Captures looked like they belonged in that family — `text`
is kept verbatim on purpose — so it was easy to assume `destination` was fixed
forever too.

But a capture's `destination` is not a fact about the world; it is the
classifier's guess about where a sentence belongs, and the classifier (model
or rules) gets it wrong sometimes. The capture log drawer (roadmap item 11)
exists specifically to correct that guess: undo a bad filing, refile it
elsewhere, or delete the whole thing.

The alternative — treat every correction as a brand-new, independent capture
and leave the wrong one in place forever, append-only like an event — was
considered and rejected. It would mean the log always shows the mistake next
to its fix, forcing every future reader (a card, a timeline, someone scrolling
the drawer) to work out which of two captures about the same sentence is the
live one. That is exactly the kind of derived bookkeeping rule 6 exists to
avoid.

## Decision

`destination` on a `Capture` is mutable; `text` and `route` are not. `route`
describes how the *original* destination was decided and is never overwritten
by a later correction — only the `capture.refiled` event's payload records the
change (`{from, to}`).

Three new event types make every correction visible on the timeline:
`capture.undone`, `capture.refiled`, `capture.deleted`. Nothing about a
correction is silent.

Undo and Refile are refused once the record the capture produced has been
touched by the user since creation (`completedAt` set, or `updatedAt !==
createdAt`) — a completed task or an edited goal outranks a correction made
from the capture log. Delete has no such guard: it is explicit, always
available, and the one irreversible action, so it carries a confirmation step
instead.

## Consequences

- `lib/store.js` needs an `updateCapture`, which the contract does not have
  today — the first store update that corrects a classification decision
  rather than a user editing their own data.
- A capture in the log can end up showing a destination the classifier never
  proposed, and that is fine: `route` still answers "how was it *first*
  decided", the corrected destination is simply the current truth.
- The five destinations with no produced record (`people`, `finance`,
  `nutrition`, `health`, `memory`) have nothing for Undo to retract, so Undo
  is unavailable on those rows; Delete is not. Refile has no such
  restriction — with nothing to retract, it simply creates a record at the
  new destination if that destination is `task`/`goals`, which is how a
  capture mis-filed to one of these five gets corrected without deleting and
  re-saying it.
