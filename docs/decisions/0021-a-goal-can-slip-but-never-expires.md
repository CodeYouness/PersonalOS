# 0021. A goal can slip but never expires

- **Status** accepted
- **Date** 2026-10-06

## Context

Goals never reset on their own (`docs/domain.md`, Goal): a promise does not
stop existing because a week ended, and `horizon` is a label, never an
expiry. That rule keeps a goal from disappearing, but on its own it also
hides something true. A `week` goal made three weeks ago and still open looks
exactly like one made this morning. The Review mockup already calls this
"slipped" and prints "· 3rd week" next to it.

Counting that age from `createdAt` is the obvious way, and it is wrong in one
case that matters: you look at a slipped week goal and decide it is really a
month goal. Changing the horizon is making the promise again. Counted from
`createdAt`, a goal from August turned into a `month` goal today would read
"3rd month" the moment you saved it -- the card telling a story you just
deliberately changed. Tasks had the same problem with `overdue` and solved it
with `bandSetOn` (ADR 0008).

## Decision

**A goal's age is shown, never acted on.** An open goal is *slipped* once it
is past the calendar period its horizon named: a `week` goal from the
Monday-to-Sunday week after the one it was set in, a `month` goal from the
calendar month after. The card shows the period it is in -- "2nd week",
"3rd month" -- and nothing in its first period. An `open` goal never slips.
Slipped is derived in `lib/domain/derive/goals.js` and never stored; it
changes nothing about the goal.

**The age counts from `horizonSetOn`**, a new canonical day key set when the
goal is created and whenever its horizon changes to a different value. A
re-promise restarts the clock, exactly as changing a task's band resets
`bandSetOn`. Setting the same horizon again is not a change. The v7 -> v8
migration backfills `horizonSetOn` from `createdAt`, in the user's timezone,
and is idempotent.

**A passed target date only changes how the date looks**: shown in the `due`
style, derived against today. The goal is not closed, moved or flagged.

## Consequences

- Nobody should "fix" a slipped goal by closing it automatically or moving it
  to a new period. The only ways a goal leaves the card are Done and Delete.
- Calendar periods mean a `week` goal set on Sunday is in its 2nd week on
  Monday. That is correct: "this week" was over.
- Rejected: counting from `createdAt` (no new field, but a re-promise keeps
  the old age), and rolling 7- or 30-day blocks (they disagree with what
  "this week" means).
