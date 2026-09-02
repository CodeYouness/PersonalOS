# 0009. Money is integer minor units, and imports own only half a record

- **Status** accepted
- **Date** 2026-09-02

## Context

Two separate mistakes are easy to make in a personal finance domain, and both
are expensive to undo once there is a year of data.

**Floating point money.** `0.1 + 0.2` is not `0.3`, and a net worth assembled
from a few hundred float additions is wrong in a way nobody notices until it
is compared with a bank statement.

**Imports overwriting your work.** A spreadsheet or a broker is the source of
truth for what a transaction *was*. But categorising it, annotating it and
linking it to a goal is work **you** do inside PersonalOS. A naive importer
that upserts the whole row wipes that on the next run, and the user learns not
to trust the categories.

## Decision

**Amounts are integers in minor units.** Cents, never euros. The store rejects
a non-integer amount at the boundary. Formatting for display is a presentation
concern and happens in one module.

**An imported record has two zones of ownership:**

| Owned by the source | Owned by you |
| --- | --- |
| date, amount, currency, description, accountId, kind, origin | categoryId, note, links |

`upsertTransactionByOrigin()` rewrites the left column and never touches the
right one. Matching is by the pair `(origin.source, origin.externalId)`, which
also makes re-running an import idempotent rather than duplicating.

Related and enforced in the same place: a `transfer` requires its
`counterAccountId`, and every aggregation excludes transfers. Money moved
between two accounts you own is neither income nor spending, and counting it
doubles the month.

## Consequences

- Totals are exact. There is no rounding drift to explain.
- You can recategorise freely and re-import tomorrow.
- Every read of an amount needs formatting; every write needs conversion at
  the edge. That cost is real and is accepted.
- A future importer must go through `upsertTransactionByOrigin`. An importer
  that calls `updateTransaction` with a full row is the bug this decision
  exists to prevent.
