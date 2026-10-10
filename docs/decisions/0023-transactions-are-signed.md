# 0023. A transaction's amount is signed, and a transfer is one with a counter account

- **Status** accepted
- **Date** 2026-10-10

## Context

The `Transaction` model was written before any real money reached it: an
always-positive `amount` with a `kind` of `income`, `expense` or `transfer`
(ADR 0009). The spreadsheet it now has to replace (#132) records money the
way it actually moves, and three things in it do not fit that model:

- **A refund** on something bought is money coming back into a spending
  category. With `kind`, it can only be `income` -- so income is inflated and
  the category still shows the full spend.
- **Money that is neither income nor spending** -- a loan repaid by a friend,
  a deposit returned -- still moves a balance. With `kind`, it has to be one or
  the other, and either one distorts the month.
- **A transfer** was a third `kind` that also needed a `counterAccountId`: two
  fields that had to agree, saying one thing.

## Decision

**The amount is signed from `accountId`'s side.** Negative means money left
the account; positive means it came in. Zero is refused. A category's kind
decides whether money counts as income or spending (#137), so a refund is a
positive amount in the spending category it belongs to.

**`kind` is removed. A transaction is a transfer exactly when
`counterAccountId` is set**, and the counter account receives `-amount`. A
transfer carries no category: money moved between your own accounts is
neither income nor spending. A transfer from an account to itself, or to an
account that does not exist, is refused.

**`notCounted`** is a boolean for money that moves a balance but is neither
income nor spending. **`tags`** are free text, the same posture as a task's.

**Every aggregation excludes transfers and not-counted transactions.**

**Neither account may move after the day it was archived.** The day itself
is allowed: closing an account moves its last money out that day.

**The ownership zones change** -- this amends ADR 0009's table:

| Owned by the source | Owned by you |
| --- | --- |
| date, amount, currency, description, accountId, origin | categoryId, counterAccountId, notCounted, tags, note, links |

`counterAccountId` moves to your side: recognising that a line was a transfer
is classification, the same kind of work as choosing its category, and a
re-import must not undo it. `upsertTransactionByOrigin` reads only the
source's column from its input, whatever else the input carries, and checks
the result under the same rules as a hand correction. A line imported for
the first time is created whole: what it carries for your zone -- a
transfer's counter account, a category -- is where it starts, and from then
on it is yours.

**Schema v12** migrates existing data once, after a backup: `income` becomes
`+amount`, `expense` becomes `-amount`, and `transfer` becomes `-amount` with
its counter account kept and its category cleared -- transfers were excluded
from every total, so it never counted under one. A counter account on
anything that was not a transfer is cleared, or it would turn income or
spending into a transfer; a transfer with no counter account becomes not
counted. Each month's income and spending is the same
before and after.

**Categories have two levels** (#136), the kind on the top level only: a
subcategory takes its parent's. A transaction is filed on either level, and
its category must exist. The store refuses a third level, a move across
kinds, a kind change on a category in use and deleting one in use; schema
v13 puts every existing category at the top level, not a fixed cost.

## Consequences

- A refund reduces the spending it belongs to, and a chargeback reduces
  income: the category's kind decides (#137). Uncategorised money counts by
  its sign.
- "Is this a transfer" has one answer, in one field.
- A user can recognise an imported line as a transfer, and a re-import keeps
  it.
- Every reader of `amount` must respect the sign. A future importer that
  writes a positive amount for spending writes income.
- A migrated zero amount, which the old model allowed, stays zero until it is
  corrected; the store refuses only new ones.
