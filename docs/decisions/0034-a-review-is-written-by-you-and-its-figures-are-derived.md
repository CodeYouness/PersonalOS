# 0034. A review is written by you and its figures are derived

- **Status** accepted
- **Date** 2026-11-11

## Context

Spec #232 closes the loop between living a week and learning from it: a weekly
review you write, beside the numbers the system already knows. The first
question is what a review record holds. A review screen needs habit
completion, intake, spending and what was closed in the week, and the obvious
shape is to snapshot those figures into the review when it is written. That
copy would be the second place a number lives. Edit a meal, correct a
transaction or tick a habit late, and the review keeps saying what the week
looked like when you wrote it, disagreeing with every card (rule 6, ADR 0008).

## Decision

**A review holds only what you wrote**: `answers` (`worked`, `heldBack`,
`change`), the `lever`, and `completedAt`. Its figures are derived from the
days of its week when it is read, and are never stored in it.

**One review per `(period, from)`**, in its own `reviews` collection.
`period` is a closed vocabulary (`REVIEW_PERIODS`, today `week`); `from` is the
first day of the period, a Monday for `week`, not after the period containing
today. The store exposes `getReview(period, from)`, one `saveReview` that
creates the review if absent and otherwise merges the fields given, each
written on its own inside the serialised write (ADR 0011), and
`deleteReview(period, from)`.

**Completing is a fact that happened, so it is an event**: `review.completed`,
written in the same write that sets `completedAt`, once. A correction after
completion changes `updatedAt` and writes nothing, as for a task or goal. There
is no reopen. Deleting removes the review and keeps the event: events are
never deleted, so deleting a completed review and completing a new one for the
same week writes a second `review.completed` for that week.

**Refusals live in the store**: unknown period, a `from` that is not the first
day of its period or is in the future, over-long text (`limits`), unknown
fields. The routes (`/api/reviews/[period]/[from]`, GET, PUT, DELETE) check the
shape of the request and map the store's refusal to a 400 that wrote nothing;
a read of a week with no review is `null`, not an error.

**One schema migration, 19 to 20**, adds the empty `reviews` collection and
nothing else.

## Consequences

A review can never disagree with the days it describes, because it holds none
of them. The cost is that its figures are recomputed on every read, and that a
changed past (a late tick) changes how an old review reads; that is the
intent. What you wrote that week stays exactly as you wrote it.

The lever is part of the review that wrote it, not an entity of its own: this
week's lever is derived as the lever of last week's completed review. Do not
add a stored copy on the profile.

A new period (month, year) joins `REVIEW_PERIODS` together with its rule for
the first day of the period, in one place in the adapter.
