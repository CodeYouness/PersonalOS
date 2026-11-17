# 0042. The hand-kept ledger gives its categories to the statements, and is the source only where there is no statement

- **Status** accepted
- **Date** 2026-11-17

## Context

Stage 2 of ADR 0037: for an account that has statements, the statements are
its transactions (ADR 0041 imports them, uncategorised). Before PersonalOS,
every movement was kept by hand in a ledger -- a spreadsheet of movements with
the user's own two-level categories, notes, a project tag, and whether each
row counted in spending or income -- across several accounts. Most of those
accounts now have statements; some never will (cash in hand, a bank with no
export).

So the same money is described twice: once by the bank, with the right
amount and date and no meaning, and once by hand, with the meaning. Importing
the ledger's rows beside the statements would count every month twice;
throwing the ledger away would lose ten months of categorising.

The older one-off importer (`data:import-sheet`, #139/#140) read the same
ledger as an xlsx through a private mapping and imported every row as a
transaction. It predates statements, so on an account that has them it would
double every month, and it needed a hand-written mapping of every category
pair. It is replaced, not extended: two importers of one ledger that disagree
about what a row is would be a trap.

## Decision

**`npm run data:import-ledger`** reads the ledger's CSV export -- movements,
categories, accounts -- and replaces `data:import-sheet`, which is deleted
with its tests.

**Categories.** The model already has two levels (#136): a top-level
category with a kind, a subcategory with a `parentId`, a `fixedCost` flag on
either. The ledger's `categoria > sottocategoria` maps onto it directly; no
schema change. A category is found by name under the same parent, or
created, so the same subcategory name under two categories is two
subcategories and a second run creates nothing. A top-level category is
**income** when the rows the ledger counted under it are money in and never
money out (all its rows, when it counted none), and **spending** otherwise --
so a refund the ledger left out of an income category does not turn it -- so a payments-to-the-broker category is spending
by kind, and its rows are kept out of the totals by `notCounted`. One that
exists with the other kind blocks. The ledger's `ricorrente` becomes
`fixedCost` on a subcategory the import creates: both are the user's own
statement that the money was committed before the month began. A category
that already exists keeps its flag.

**Accounts.** A ledger account is the account of the same name, or the one
`--account-map "<ledger name>=<account name>"` names. One that has statement
movements is **matched**; one that has none takes **the ledger as its
source**, and is created (cash, valued by balance, no origin) when missing.

**Matching.** Each end of a ledger row on an account with statements finds
the one statement movement it describes: the same account, the same signed
amount in minor units, dated within `--window` days (3 by default: a bank
books on the day, a card a day to three later). One to one, and greedy over
every candidate pair ordered by days apart, then the earlier ledger day, the
ledger id, the out end before the in end, the earlier statement day and the
statement's id -- so every same-day match is made before any match a day
apart, and every run makes the same ones. A match writes the **user's zone**
of the statement movement (ADR 0023) -- category, note, the project tag,
not counted -- **only where it is still empty**; a field set otherwise in the
app is left alone and counted in the report. **A ledger row that matches
nothing is listed, never imported**: on that account, the statement is the
transactions.

**The ledger as the source.** On an account without statements, each row is
a transaction, origin `{ source: 'sheet', externalId: <ledger id> }` -- the
source the old importer used, for the same ledger -- with its category, tag
and not-counted flag; its description is the ledger's note, or the
subcategory when there is none. Its `saldo_iniziale` rows are one opening
balance, dated the day before its first movement (ADR 0024), not recorded
when a balance already anchors the account on or before that day. A
`saldo_iniziale` on an account with statements is ignored and listed: the
statement's running balance knows better.

**Transfers.** A ledger transfer moves money from A to B. Each end belongs to
its own account's source, and the transfer is represented so that each
balance moves exactly once and neither end counts as spending or income:

| Case | What is written | A's balance | B's balance | Spending, income |
| --- | --- | --- | --- | --- |
| A and B have statements, both rows found | Both statement rows: not counted, with the category, note and tag. No counter account | −x, its own row | +x, its own row | neither: not counted |
| A and B have statements, only A's row found -- a card topped up from the bank, whose own statement lists only spending | A's row: counter account B | −x, its own row | +x, through A's row | neither: a transfer |
| A and B have statements, only B's row found | B's row: counter account A | −x, through B's row | +x, its own row | neither: a transfer |
| A has statements, B has none -- cash taken out | A's row: counter account B. No ledger transaction on B | −x, its own row | +x, through A's row | neither: a transfer |
| A has statements, B has none, A's row not found | A leg on B: +x, not counted, no counter account, key `<ledger id>:leg`. A's row listed | unchanged: its statement shows it or does not | +x, the leg | neither: not counted |
| A has none, B has statements -- cash paid in | B's row: counter account A (or, not found, a leg on A of −x) | −x, through B's row or the leg | +x, its own row | neither |
| Neither has statements | One ledger transaction on A, −x, counter account B | −x | +x | neither: a transfer |
| Both have statements, no row found | Nothing; both ends listed | unchanged | unchanged | -- |

Where both ends are statement rows, neither may carry a counter account: the
counter account receives `-amount`, so the other balance would move twice.
A counter account is only set on a row with no category, since a transfer
carries none (ADR 0023). "Only one row found" cannot tell a card that never
lists top-ups from a row outside the window; the report lists those
transfers so they can be checked.

**The end the ledger feeds is always written.** When the statement row of a
transfer to or from an account the ledger feeds is found on a later run -- a
wider window, a newer export -- the leg an earlier run wrote is deleted in
the same run that gives the row its counter account, so the money is on the
account once; a row that cannot carry it (you gave it a category or another
counter account) keeps the leg.

**For an account the ledger feeds, the ledger is the source, so its numbers
must come out the ledger's.** Its balance after the import -- on the
ledger's last day, or a later statement row reaching it -- must equal its
opening balance rows plus every row on it, and its spending and income over
the ledger's days must equal the ledger's counted rows as PersonalOS files
them. Either difference blocks: it means a row was lost, or something not
from the ledger moved the account. "As PersonalOS files them" is the one
deliberate difference from the ledger's own dashboard: money in that the
ledger counted as income but filed in a spending category is a refund (ADR
0023), so spending and income are each that much lower and what is left is
the same. The report prints that amount; it is not a lost row.

**A payment to a broker** (`investimento`) is matched like any row money
leaves by -- or, on an account without statements, imported -- with its
category and the ledger's not-counted flag. No holding, trade or transfer is
made: the broker sync owns those (ADR 0031).

**The report** prints, dry run and after a write: the categories to create,
the accounts and which side of the line each is on, per account the matches
by days apart, the fields filled and left alone, the unmatched ledger rows
(30, then how many more), the statement movements in the ledger's range still
uncategorised, the transfers by case, the opening balances, and a **totals
check** -- spending and income per account as the ledger counted them,
against `totalsBetween` over the same days on the data as it would be after
the import, with the difference. Neither side is ever adjusted.

**Refused, writing nothing**: a row that cannot be read, a header that is not
the ledger's, the demo finance rows, an account it cannot file on (valued by
units, synced, archived, or a name two accounts share), two ledger accounts
onto one, a category of the other kind, and any `sheet` transaction this
ledger does not plan -- the old importer's, a row deleted since, or one on an
account that has statements now -- since it would count beside the statement.

## Consequences

- A re-run is idempotent: the matching is recomputed the same way, filled
  fields are already filled, and a run with nothing to change takes no
  backup. A category or note changed in the app survives every re-run.
- An account that gains statements after the import has `sheet` rows the
  ledger now only matches; the next run blocks until they are deleted, so
  the month is never counted twice.
- Ledger rows on a statement account before its statements start are listed
  as unmatched and not imported: those months have no spending on that
  account until a statement covering them is imported.
- The next ticket categorises the statement movements the ledger did not
  describe; the report already counts them.
- Do not "fix" a both-statements transfer by giving one row a counter
  account: that moves the other balance a second time.
