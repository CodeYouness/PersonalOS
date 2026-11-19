# 0058. The Transactions card reads a month at a glance, and searches all time

- **Status** accepted
- **Date** 2026-11-19
- **Amends** [0055](0055-a-refund-is-paired-with-its-purchase.md) and
  [0056](0056-a-deposits-interest-is-one-row-a-month.md) (the Transactions
  card's quiet lines become one), [0048](0048-finances-reads-at-a-glance.md)
  (the cap: 100, not 50), [0046](0046-spending-by-tag.md) (the selected
  movement is never left out of the list beside it)

## Context

The Transactions card should read a month at a glance. Three things stood in
the way.

- **Up to three quiet lines** piled under the list: "The newest 50 of 57 in
  March 2026. Show all 57, or pick a category or a tag to narrow it.", "5
  refunded movements hidden — show", "60 interest movements folded by month —
  show". Each said one thing; together they were a paragraph to read before
  the next card. And a month of 57 rows was cut at 50, leaving seven behind a
  link.
- **Movements not counted** -- money moved between your own pots by hand, a
  loan to a friend and its repayment -- are in no total, yet sat in the month
  between the movements that are. Quieter, but there, and in a busy month
  many.
- **Nothing found a movement** you remembered but could not place: the
  jacket returned in spring, the 12.50 from some lunch. The card reads one
  period at a time, and refunded or folded rows are hidden on purpose.

## Decision

**One service line** under the list, in the Transactions card (`ServiceLine`
in `components/FinanceTransactions.js`): what the list leaves out, joined by
" · ", then " — " and each way to undo it as a link, grouped by what the link
does:

> The newest 100 of 140 in March 2026 · 5 refunded and 12 not-counted
> movements hidden · 60 interest movements folded by month — show: all 140,
> refunded, not counted, interest

It names only what applies; what is shown already is said and offered back
("5 refunded movements shown · 60 interest movements shown one by one —
hide: refunded · fold: interest"; "All 140 in March 2026 — show: newest
100"); and it is absent when nothing applies. Each link keeps every other
parameter and carries an `aria-label` that says the whole action ("Show the
12 not-counted movements"). The narrowing hint ("pick a category or a tag")
is gone: the search field says it better. The movements a line opens in place
in Income & spending keep their own quiet lines (ADRs 0055, 0056), short
enough there.

**The cap is 100** (`limits.financeListMax`): a month a little over fifty is
listed whole, a year still says "the newest 100 of …" and offers them all
(`?span=all`). A line's movements opened in place read the same cap.

**A movement not counted is hidden like a refunded one.** In
`listedTransactions`, with nothing selected, a movement marked not counted is
left out unless `?uncounted=show` (`financesUncounted`, kept in the address
after `interest`), and `uncounted` counts it, as `refunded` counts the
refunded. A line's or a tag's list never held one (`lineHolds`, `tagHolds`),
so there is nothing to hide there. A transfer between your own accounts that
is not marked stays: it says where the money went. There is no account's
list of movements on this screen -- an account's panel shows its balances,
trades and prices -- so none has to explain a balance here. The cap and
`more` count the rows as shown.

**The movement open in the panel is never left out** (`selected`), refunded
or not counted, and is not counted as left out: the list beside a panel
holds what the panel shows. Until now a refunded movement opened from a
citation was hidden beside its own panel; it is now listed, read as it is
shown ("refunded", at its own amount). A selected movement can still fall
outside the newest 100 of a year, as ADR 0046 says.

**Search by text**, `?q=<text>`. The card's head holds a plain GET form --
a search field, no script, the page rendered on the server -- that carries
the place (account, month, period, view, the toggles) as hidden fields
(`financesParams`) and drops the selection: line, tag, span and open
movement. The parameter is read at the boundary (`financesQuery`): one
string, spaces collapsed, trimmed, cut to `limits.financeSearchMaxLength`
(100) characters; empty or blank is no search.

- **What matches** is one pure rule, `lib/domain/derive/search.js`: every
  word of the search is found -- case and accents ignored (`foldText`) -- in
  the movement's description, note, tags, category name, the category's
  parent's name, its account's name or a transfer's other account's name; or
  the word is an amount typed as a person types it (`amountQuery`: "12.50",
  "12,50", "250", "1.250,00", a sign or "€" ignored) equal to the movement's,
  whichever way the money moved.
- **What it lists**: every match of all time, newest first, whatever the
  period, capped at the newest 100 with the service line offering them all
  (`?span=all`). Nothing is hidden or folded -- finding a refunded purchase
  is the point -- and a refunded or not-counted row keeps its mark at its own
  amount. A day of interest is listed as itself.
- **The head** says what is listed, "12 movements matching “lunch”", and
  links back to the period ("back to March 2026": the search, the span and
  the open movement cleared).
- **With a panel**: `q` is written before `transaction`, so opening a result
  keeps the results listed beside it.
- **A selected line or tag wins** over a search, as a line wins over a tag:
  picking one from Income & spending or By tag lists it, and the page drops
  the search from the place, so the field and the links never carry a search
  that is not shown.

## Consequences

- Display only. No figure reads the list: a test computes the month, the
  year, the columns, By tag, the uncategorised count, the lines' lists and
  the overview before and after every list -- hidden, shown, selected,
  searched -- and finds them equal. Nothing is stored and the schema stays.
- A search runs on a page load over every movement, in the request; it never
  calls the model or an integration (rule 3). It reads the store's
  transactions already loaded for the page, so it costs no extra read.
- A search of one number also matches it as text: "250" finds the 250.00
  movements and "Order 250". "12" does not find 12.50: an amount matches
  exactly.
- Months of not-counted movements now say so in the line ("12 not-counted
  movements hidden"), where before they were rows.
