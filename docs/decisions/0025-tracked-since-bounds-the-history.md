# 0025. "Tracked since" bounds the history

- **Status** accepted
- **Date** 2026-10-10

## Context

The monthly net worth history is derived from the first balance or trade to
today (ADR 0022). The spreadsheet PersonalOS replaces (#132) holds trades
from long before the user tracked anything else: an ETF bought years ago
starts the history in a year when no cash account, no pension and no debt was
recorded. Drawn as it stands, those years read as years with almost no money,
and the 1-year change compares today with a month that was never measured.

Dropping the old trades is not an answer: they are what makes today's units
right.

## Decision

**A "tracked since" day lives in the profile, `financeTrackedSince`**, a
nullable day key validated at the store boundary and set from the Finances
screen's Settings card (or by the migration, #140).

When it is set:

- **The monthly history starts at the first month-end on or after it** -- the
  end of its month -- or at the first value if that is later.
- **The 1-year change is blank when its start falls before it.** A change from
  a month that was not tracked is not a change.
- **Trades dated before it still count toward a holding's units.** They are
  only not drawn: valuation is untouched.
- The Pulse card's sparkline follows, through the same derivation, and the
  months the Income & spending section offers start at its month.

When it is not set, everything behaves as before.

It is a finance input like the accounts and transactions
(`getFinanceInputs`), so every screen that draws the history reads it the
same way. This amends ADR 0022, whose history ran from the first balance or
trade.

## Consequences

- Years that were not tracked are never drawn as years of being poor.
- The 30-day change is not bounded: thirty days before a "tracked since" in
  the past is rarely a question worth a rule.
- Setting the day later than some balances hides those months too; clearing
  it brings them back. Nothing is deleted.
