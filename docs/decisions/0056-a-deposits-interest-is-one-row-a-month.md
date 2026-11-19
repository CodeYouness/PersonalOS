# 0056. A deposit's interest is one row a month in the lists

- **Status** accepted
- **Date** 2026-11-19
- **Amends** [0055](0055-a-refund-is-paired-with-its-purchase.md) (how the
  lists show what they leave out), [0048](0048-finances-reads-at-a-glance.md)
  (what the cap counts)

## Context

A deposit account pays interest every day. Its statement (ADR 0041) writes
a movement a day -- a few cents in -- and, Revolut's `Costo` being imported as
a movement of its own, the tax withheld on it beside it, money out, with the
same movement type and `part: 'fee'`. That is some sixty rows a month in the
Transactions card and in the interest line's list, each saying nothing on
its own, between the movements that do. The owner asked for one row per
account per month with the net sum.

Merging the movements is wrong for the reasons ADR 0055 gives against
deleting a refund: the statement is the source of the account's movements,
a re-import would bring the days back, and the original is never lost (rule
7). Each day also stays a movement its panel can open and file. This is
display, and only display.

## Decision

**What is interest** is one pure rule, `isInterestMovement`
(`lib/domain/derive/interest.js`): a movement **from a statement**
(`origin.source === 'statement'`) whose **bank's own movement type** -- the
`origin.detail.type` the importer already keeps, Revolut's `Tipo` -- is one of
the words a source uses for interest, `INTEREST_MOVEMENT_TYPES` in
`personalos.config.js` (today `Interessi`), compared ignoring case. The fee
withheld on interest carries the same type (the importer copies the row's
detail onto its fee part), so it is interest's too, and a currency
exchange's fee is not.

Why this signal and not another:

- It is the importer's, already stored on every imported row: existing data
  works with no re-import, no migration and no schema change.
- It holds for interest only. A merchant key (`merchantKey`) or a run of
  equal descriptions would fold four coffees at one café; a category would
  fold whatever the user filed under it, and differs between the interest
  and its tax. The bank's type is the bank saying "this is interest".
- The derive code holds no bank's wording: the words are a closed list in
  the configuration, documented in `docs/domain.md`, which a second bank's
  word joins. A word added there applies to every movement already imported:
  nothing is stored from it and nothing is refused by it, so it is not
  validated at the store, unlike the vocabularies that are written.
- A movement typed by hand has no origin, so it never folds: what the user
  wrote is shown as written.

**What a list folds** (`foldInterest`): the interest movements that count as
a flow on their own date (`foldsAsInterest`: not a transfer, not marked not
counted -- which a list shows quieter -- and not counted over several months,
which shows its months), grouped by **account and month**. A group of at
least `limits.financeInterestRunMin` (3) movements **in the list** becomes
one `InterestRun` -- `{ accountId, month, date: its newest day, amount: the
net, count, days, ids, categoryIds }` -- placed where its newest movement
was, so a list newest first stays newest first. Fewer stay as they are: a
day's interest and its fee need no summary. One end of a refund pair (ADR
0055) is never folded; it keeps its note.

**Where.** The two list derivations, `listedTransactions` and
`lineMovements`, fold after leaving out the refunded movements, and before
the cap: `max` and "and N more" count the rows as shown. The run is built
from **the list it is in**, so it holds what that list holds:

- in the Transactions card with nothing selected, the interest and the tax
  of the month, at the net;
- with a line selected, and in the movements a line opens in place, only
  what the line counts -- the interest in its income line, the tax in its own
  -- so a row never shows an amount its line does not count;
- with a tag, the tagged ones; with `?span=all`, each month on its own.

**What the row shows.** On its newest day, "Interest · 31 days" -- a link to
the same place with `?interest=show` -- with "· 62 movements" after it when
there are more movements than days; in the Transactions card the categories
it holds ("Interest, Taxes", quiet when more than one) and its account; in a
line's list its account after the name; its amount signed as any movement
(`MovementAmount`). It is selected while it holds the selected movement, so a
citation that opens one day still marks its place.

**Opening it.** `?interest=show` -- a parameter of the Finances address, kept
with the others and written after `refunded` -- lists every movement as it
is, each opening its own panel. A last quiet line, the refunded line's
sibling, says "62 interest movements folded by month — show", or, shown,
"… shown one by one — fold" (`InterestLine`), in the Transactions card and
under a line's list.

**Nothing else changes.** No figure reads the fold: the month, the year, the
columns, the circle, the lines, By tag, the uncategorised count, the week,
balances and net worth count each movement as before. A test computes every
figure before and after the lists fold and finds them equal, and finds that
a line's list adds up to the line's total folded and shown alike.

## Consequences

- A bank whose statement types interest with another word does not fold
  until that word is added to `INTEREST_MOVEMENT_TYPES`; the lists are then
  just longer, never wrong.
- A month's run folds per list: a line that holds only two of the month's
  interest movements (say, after a few were recategorised) shows them plainly
  while the card with nothing selected folds the rest.
- The question context lists movements by its own reading and is unchanged;
  it never saw the lists.
- The seed has no statement movements, so the sandbox shows no run until a
  statement is imported into it.
