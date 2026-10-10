# 0024. Between two balances, an account follows its movements

- **Status** accepted
- **Date** 2026-10-10

## Context

Until now a cash account's value was its latest observed balance and nothing
else: "balances are observed, flows are recorded, and neither substitutes for
the other" (`docs/domain.md`). That was right while nothing recorded flows.

From #134 on, every movement is recorded -- cash included, across several
accounts -- the way the spreadsheet PersonalOS replaces records it (#132). The
spreadsheet derives each balance from an opening balance plus movements and
never asks for one to be typed. Keeping the old rule would leave the account
table frozen at the last balance while the month's spending scrolls past
beside it, and would make the user type a balance they can already derive.

Deriving a balance from movements alone needs a known opening balance and
complete coverage. Neither is guaranteed: a forgotten coffee, a fee nobody
noticed.

## Decision

**An account valued by balance is worth, on date D, its latest observation
dated on or before D, plus every movement on it dated strictly after that
observation and on or before D.** From the account's side, a movement counts
as `amount` where it is the transaction's account and `-amount` where it is
the counter account (ADR 0023).

- **A balance includes the movements dated on its own day.** Only later days
  are added on top, so the same day is never counted twice.
- **A balance typed later is a reconciliation point.** Forgotten movements
  before it are absorbed rather than carried forever.
- **With no observation on or before D, the account is unknown** -- never
  zero, however many movements it has.
- **A liability counts a movement the other way.** It stores the positive
  amount owed, so money landing in it reduces the debt and money leaving it
  raises it.
- **Accounts valued by units ignore transactions entirely.** A transfer into
  a holding lowers the cash account; the holding stays valued by its trades
  and prices.
- **A not-counted movement still moves the balance.** It is only out of the
  month's totals.
- The value is **dated** by the later of the observation and the last
  movement counted.

Today's net worth, the account table, the monthly history and the 30-day
change all follow, because they already go through the one `accountValueOn`.

Since the kind decides which way a movement counts and the valuation decides
whether it counts at all, **both are fixed once money has moved on the
account**, as they already were once it had a balance, a trade or a price.

This amends `docs/domain.md` § "The stock and the flow".

## Consequences

- Recording, correcting or deleting a movement changes the account table, net
  worth and the history. The past you see is the past you recorded.
- The user types a balance only to reconcile, or to start an account.
- A movement dated before an account's first balance is not counted
  anywhere. The migration (#139, #140) dates opening balances the day before
  each account's first movement for this reason.
- The derivation costs one pass over the transactions per account per date
  asked. At one person's volume that is nothing; if it ever is not, cache it
  in the adapter, never in the data file (ADR 0022).
