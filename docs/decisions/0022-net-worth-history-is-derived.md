# 0022. Net worth history is derived, and snapshots are no longer written

- **Status** accepted
- **Date** 2026-10-09

## Context

ADR 0008 made `NetWorthSnapshot` the one exception to "do not store what can
be derived": a snapshot is net worth on a date, stored because "yesterday's
market value is gone tomorrow" and recomputing the series would rewrite your
past. The exception was written before anything recorded finance data, and
before anything wrote a snapshot. Nothing ever did -- the only snapshot in a
data file is the seed's.

The Finances screen (#111) needs a monthly history and a 30-day and 1-year
change. Looking at what they would be computed from:

- **Balances** are observations, and an observation is never overwritten. A
  pension typed in March is still there in October; correcting it is a
  correction of the past, which the history should follow.
- **Holdings** are valued from trades and prices (#116, #117): the units held
  on a date times the latest price on or before it. Every price is one you
  paid or typed, and every one is kept.
- **Exchange rates** are what ADR 0008 really had in mind when it said the
  inputs disappear: converting historic figures at today's rate rewrites the
  past. But everything is EUR until rates exist (#111), so there is nothing
  to convert.

In one currency, then, every input of the history still exists. The
condition ADR 0008 set for an exception -- "the inputs no longer exist" -- is
not met.

## Decision

**The history is derived.** `financeOverview` in
`lib/domain/derive/finance.js` computes month-end net worth for every month
from the first balance or trade to today, and the changes, from the same
`accountValueOn` that values an account today. Nothing writes a snapshot.

To keep the past honest without a stored copy:

- **An archived account counts on every day before it was archived.**
  Archiving is a day (`archivedOn`, #115), not a flag, so closing a loan
  never raises last year's net worth.
- **A value stays flat between two balances or prices.** Nothing interpolates
  a movement that was not recorded.
- **A holding's history starts at its first trade.** A price with no units
  behind it values nothing.

`NetWorthSnapshot` stays in the model, unwritten, and ADR 0008's exception
narrows to it: the day exchange rates arrive, a snapshot is what fixes the
rates a past month was converted at, and that is the moment to write them.

## Consequences

- Correcting or deleting a balance, a trade or a price corrects the history
  too. That is the point: the past you see is the past you recorded.
- The history costs a pass over the finance rows per month shown. At one
  person's volume that is nothing; if it ever is, cache it in the adapter,
  never in the data file.
- A future reader who sees `snapshots` in the document and no code writing
  it must not "fix" that by writing one per day. It waits for exchange rates.
- When a second currency is allowed, this ADR is the one to revisit: from
  then on a month-end converted at today's rate would be a rewritten past.
