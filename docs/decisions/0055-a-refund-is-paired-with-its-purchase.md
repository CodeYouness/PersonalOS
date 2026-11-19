# 0055. A refund is paired with its purchase, and the pair leaves the list

- **Status** accepted; amended by
  [0058](0058-the-transactions-card-reads-a-month-and-searches.md): in the
  Transactions card the quiet line is part of one service line ("5 refunded
  movements hidden — show: refunded"), and the movement open in the panel is
  never left out
- **Date** 2026-11-19
- **Amends** [0023](0023-transactions-are-signed.md) (what decides where a
  movement counts), [0006](0006-relations-live-in-links.md) (the link
  vocabulary gains `refund_of`)

## Context

Some statement movements are a purchase and, days or weeks later, its
refund: a return, an overcharge given back, a cancelled ticket. Seen side by
side in the Transactions list they are noise, and the owner asked to delete
both. Deleting is wrong three ways: the statement is the source of an
account's movements (ADR 0037, 0041), so a balance would no longer reconcile
with the bank's; a re-import of the statement would bring both rows back;
and the original is never lost (rule 7).

How a refund counted was already right in one case and wrong in two. Money
in filed under a spending category reduces that category (ADR 0023, #137) --
but only when the refund carries the purchase's category. A refund left
uncategorised counted as **income**, and one filed elsewhere reduced the
wrong line. Today's rule is `countedFlow` in
`lib/domain/derive/finance.js`: "in a category, the category's kind decides
-- in a spending category a negative amount is spending and a refund
reduces it ... uncategorised money counts by its sign" -- read off the
refund alone.

## Decision

**The pair is a link**: `refund -> refund_of -> purchase`, a new relation in
the closed `LINK_RELS`, never a field on either movement. Both movements are
the statement's (their source zone, ADR 0023); the link is the user's and,
the ids being stable (ADR 0041), survives a re-import. No schema change: a
link is a row of the existing `links` collection, and the vocabulary is
checked when a link is written, never when the file is read: schema 25
stands, with no migration.

**What may be paired** is one pure rule, `refundRefusal`
(`lib/domain/derive/refunds.js`, read against the data by `pairRefusal` and,
for a movement about to change, `pairBrokenBy`), which the adapter refuses
by -- in `createLink`, so a script's `createLink` meets it too, and in
`updateTransaction` and `upsertTransactionByOrigin` whenever either end
changes ("unpair it first"):

- the refund is money in **on a cash account**, the purchase money out;
- neither is a transfer;
- one currency;
- the refund is not dated before the purchase. The same account is **not**
  required: a refund can land on another account;
- a refund pairs with one purchase; a purchase may have several refunds
  (partial returns), which never come to more than it cost.

Deleting either movement deletes the link, as every link of a deleted
movement already goes. `pairRefund` and `unpairRefund` in `lib/store.js`,
and `PUT` / `DELETE /api/transactions/<refund>/refund-of`, write it.

**How a paired refund counts.** `countedFlow` -- the one reading of a
movement every flow adds up -- is handed the pairs (`refundPairs`, read from
the links) and reads a paired refund **through its purchase**: the
purchase's category, top level and subcategory, and the purchase's
direction. A refund of spending reduces spending in the purchase's category;
a refund of an uncategorised purchase reduces uncategorised spending. It is
never income. The refund's own category is not overwritten; while it is
paired nothing reads it. It counts on **its own date** -- or its own months,
if it says it is counted over several (ADR 0052) -- never the purchase's,
so a refund in November reduces November; a purchase counted over several
months does not spread its refunds, which keeps the rule one sentence long.
A purchase not counted, or a transfer, takes its refunds out of every flow;
a refund marked not counted itself stays out too. Because the rule sits in
`countedFlow` (and `lineHolds`, `tagHolds` read the same), the month, the
year, the twelve months, the columns, the circle, the lines and their
in-place lists, By tag, the uncategorised count, Home's and the review's
week (`totalsBetween`) and the question context all agree; each caller
passes the pairs, and a caller that passes none pairs nothing. The import
scripts' checks pass none on purpose: they compare with the bank's or the
ledger's own counting. Balances, the accounts table and net worth never
read the pairs: both movements really moved money.

A purchase in an income category (a chargeback) is reversed the same way --
its refund counts in that income category, undoing it. With money out in
every spending case, "never income" holds for every refund of spending.

**How the pair is listed.** `listedTransactions` and `lineMovements`, the
two list derivations, leave out a paired refund and a purchase all of whose
amount came back, unless the address says `?refunded=show` (a parameter of
the Finances address, kept with the others). A purchase partly refunded
stays, at what is left of it (`refundStanding`), with "of 41.97, 2.62
refunded" after its description. A last quiet line says "N refunded
movements hidden — show", linking to the same place with them shown; shown,
a refund says "refund of <purchase>", a purchase "refunded" or what came
back, at its own amount, and "hide" replaces "show". The 50-row cap and
"and N more" count what is listed. A purchase counted over several months,
opened in a line in place, shows its part and the note rather than a net:
a part less every refund would be a number nobody spent.

**Pairing it** is the movement's panel's. On money in on a cash account,
not a transfer and not paired, "Refund of…" opens the purchases it could
give back for (`refundCandidates`): money out, not a transfer, in its
currency, dated at most `limits.financeRefundWindowDays` (90) before it and
not after, with at least its amount not refunded yet; the same account
first, then the same merchant (`merchantKey`, moved down from
`scripts/categorise/key.js` to `lib/domain/merchant.js` so the panel and
categorising read one key), then the nearest day; the first
`limits.financeRefundCandidatesMax` (20), and how many more. The window is
the panel's, not the store's: an older purchase is rare, not wrong. A
paired refund names its purchase (a link that opens it) and unpairs; a
purchase lists its refunds, each unpaired on its own, and its net. A
refused write shows the store's reason and the page is read again.

**Not in this decision:** pairing by itself. Nothing pairs a refund but the
user -- not an import, not the model. `data:categorise` could later propose
pairs in its review file (same merchant key, money in after money out of at
least its size), as it proposes transfers, for the user to accept.

## Consequences

- The list is net of refunds: a line whose purchase and refund fall in
  different months lists the purchase net in its month and hides the refund
  in the other, so a list's amounts need not add up to its line's total
  across that boundary. Showing the refunded movements restores every row.
- A refund categorised by hand keeps that category, read by nothing while
  paired; unpairing brings it back into force.
- A statement re-import that rewrites an end so that the pair would break
  -- a larger refund, a sign flipped -- blocks in its dry run, naming the
  line, and writes nothing (`planStatement` asks `pairBrokenBy`, the check
  the store refuses by). The ledger import's plan does not ask yet: a ledger
  run that rewrites a paired end would stop part way with the store's
  reason, its backup named, as any refusal outside its plan does.
- The question context says on a refund's item "refund of transaction: <the
  purchase> -- it reduces that purchase's spending, in its category, on its
  own date; never income", and on the purchase's "refunded by".
