# 0017. The summary's streak is the running one, not a thirty-day one

- **Status** accepted
- **Date** 2026-09-22

## Context

`docs/spec.md` described the Habits screen's summary as giving "completion,
the current streak, perfect days and days recorded **over the same 30 days**"
as the history heatmap below it. Ticket #40 asked for something the sentence
does not allow: "the current streak is the same number as the home card".

The home card counts the streak over 365 days (ADR 0015's periods, the spec's
"last 365 days"). Read literally, the spec asks for a streak recomputed over
thirty days, which is a different number the moment a streak passes thirty:
the home card would say 47 and the Habits screen 30, about the same streak, on
two screens one click apart.

A thirty-day streak is not a smaller version of the real one. It is a wrong
one. Nothing in the product has a thirty-day streak as a concept; the window
is the heatmap's, chosen so a month of days fits a row, and it has no more
business truncating the streak than it has truncating today's date.

## Decision

**Three of the four numbers are windowed; the streak is not.** `windowSummary`
derives completion, perfect days and days recorded over the thirty days it is
given, and deliberately does not derive a streak. The screen gets the streak
from `streak()` over `STREAK_WINDOW_DAYS`, exactly as the home card does.

`STREAK_WINDOW_DAYS` and the `365+` label it caps at moved out of
`HabitsCard` into `lib/domain/derive/habits.js` and `components/format.js`, so
the two screens read one constant and format it one way. Two copies of 365
would agree until the day one of them was tuned.

The screen says so rather than leaving it to be inferred: the summary carries
a note that completion, perfect days and days recorded are the last thirty
days and the streak is the running one. `docs/spec.md` was corrected to match.

A day on which **no habit was active** is also left out of the average, next
to the days on which nothing was recorded. Archiving closes a period at today
(ADR 0015), so a habit ticked in the morning and archived in the afternoon
leaves a day with a value written on it and nothing left to measure.
Averaging that in as 0% would be archiving rewriting the past, which the spec
says it never does — and would put a different number on the summary than the
heatmap's own rate for the same window.

## Consequences

- The Habits screen reads 365 days of logs rather than 30 and slices the last
  thirty for the summary and the heatmap. One read, so the streak it shows
  and the streak the home card shows cannot come from two different reads of
  the same days.
- "Longest streak", the fifth stat in the mockup, is still not built. When it
  is, it belongs to the same all-time question as the current streak and not
  to the window either.
- If a period selector ever arrives (`docs/spec.md`: "Not yet"), it moves the
  three windowed stats and must leave the streak alone.
