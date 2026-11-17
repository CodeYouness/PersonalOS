# 0047. The net worth line replaces the History card

Status: accepted (2026-11-17). Amends 0044 and 0046 where they mention the
History card. Amended by 0048: the line now covers every month since
tracking began, in the Net worth card, so no month of the history is out of
its reach.

## Context

ADR 0044 gave Income & spending a net worth line drawn from the monthly
history. The Finances screen then showed the same month-end values twice:
on the line, and in the History card's table (#118), which listed every
month since the first balance with its change from the month before. ADR
0044 left the overlap open. The owner asked for the card to go.

## Decision

The History card is removed. The monthly history is still derived
(`financeOverview().history`, ADR 0022) and still read by the net worth
line, Home and the question context; only its table is gone.

What the table had and the line does not:

- **Months older than the twelve the trend draws.** They are reached by
  selecting an older month or, in the year view, an older year.
- **Each month's change as a number.** The line prints the change over the
  charted span; a single month's change is read from two neighbouring month
  labels.

## Consequences

- ADR 0046's note that the line shows a gap where the History card listed
  zero no longer describes anything on screen.
- A question's citation of a past month-end still opens Finances; nothing
  on the screen lists that month's value unless the trend covers it.
