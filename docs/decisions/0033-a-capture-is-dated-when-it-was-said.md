# 0033. A capture is dated when it was said

- **Status** accepted
- **Date** 2026-11-09

## Context

The day of a meal, a weight and a transaction came from a capture's
`createdAt`, and the classifier's keyword rules resolved "oggi", "domani" and
weekday names against the server's `today()`. That was right while a sentence
was written the moment it was said. A second capture surface, the phone
(spec #221), breaks it: a sentence said at 21:00 can wait on the phone
overnight, and arrive the next morning. Filed by `createdAt`, the meal lands
on the wrong day, the expense in the wrong month at a month boundary, and
"domani" moves a task by a day.

Two shapes: make the phone's moment the capture's `createdAt`, or keep
`createdAt` and add a second instant.

## Decision

**A capture has `saidAt`, an instant, beside `createdAt`.** `createdAt` keeps
its meaning, when the record was written. Backdating it would break the one
thing that relies on it: the check that refuses Undo and Refile once a
produced record was touched compares `updatedAt` with `createdAt`, and the
capture log would no longer be able to tell a late arrival from a late
thought.

**Everything that decides a day reads `saidAt`**, in `USER_TIMEZONE` through
`lib/domain/dates.js`: the meal's day and time, the weight's day and whether
it was recorded at the moment said, the transaction's date, the `saidOn` given
to the classifier, and the keyword rules, which resolve relative days against
`saidOn` instead of `today()`. Refile reads the original capture's `saidAt`.

**The route accepts any instant in the past.** A queue on a phone can hold a
sentence for days, and refusing an old one would lose it, which rule 2 forbids.
Up to `limits.saidAtDriftMinutes` (5) ahead is clock drift and counts as now.
Further ahead is refused with 400, writing nothing: a broken clock must not
plant records on days that have not happened. A `saidAt` that is not an ISO
instant with an offset is refused with 400. Absent means now, and the capture's
`saidAt` equals its `createdAt`. The rule lives in `resolveSaidAt`
(`lib/domain/said-at.js`) so the journal route applies the same one.

**A migration (schema 17) backfills `saidAt = createdAt`** on every existing
capture, so nothing already filed moves.

## Consequences

- A capture without `saidAt` behaves exactly as before.
- The capture log shows when a capture was said when it differs from when it
  was written by more than the drift allowance.
- The route's response carries `saidOn`, the day the capture was filed on.
- A refused `saidAt` is the client's to keep: the phone leaves the sentence
  queued rather than dropping it.
- `clientId` (a resend never files twice) is a separate decision, made when
  the store learns to deduplicate; it is not part of this one.
