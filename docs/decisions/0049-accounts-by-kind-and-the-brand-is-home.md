# 0049. The accounts read by kind, and the brand is the way Home

- **Status** accepted
- **Date** 2026-11-17
- **Amends** [0048](0048-finances-reads-at-a-glance.md) (the accounts table's
  columns and its fold)

## Context

Reading the Net worth card's accounts table -- Account, Type, Value, 30d,
As of -- the owner said the type, the 30-day change and a date on every row
were noise; they wanted the value always last, one "last updated" for the
whole table, and the accounts split by kind, each with its subtotal, debt
included: a debt changes over time too and they always want to see what it
stands at. And the "PersonalOS" brand in the top bar should take you Home,
as is customary, with Home gone from the nav.

## Decision

**The accounts table is two columns, Account and Value, the value last,
in sections by kind.**

- One derivation, `accountSections(overview, rows)`: cash, invested, other
  assets and debt -- the order net worth is written in -- each kind with its
  rows in the table's order and its **subtotal**. A kind with no row is not
  shown. The subtotal is the allocation bar's own amount for that part
  (`allocation`), never a second sum, so a section and its part of the bar
  are the same number; a section head carries the bar's mark and name. An
  unknown value is left out of it, and a kind none of whose accounts has a
  value says "unknown", never 0. Debt is the positive amount owed, headed
  "Debt" with "what you owe" beside it.
- **One date for the table**, said once above it: "Last updated 17 Nov",
  the newest value counted (`financeOverview`'s `asOf`). A day, not a
  month: it costs nothing, it is the same format as every other date on
  the card ("since 31 Oct 2025"), and a month alone would read "November"
  on the 1st for a table last touched on 31 October. The broker's own sync
  line under the headline stays as it is.
- **A stale account still shows its age**, without a column:
  `accountStaleSince(row, today)` gives the day of an account's value when
  it is more than `limits.financeStaleAccountDays` (35) days old, and the
  row says "since 2 Jan" after the name. About a month and its slack, so a
  balance typed once a month never shows it. Only those rows: the table
  stays clean, and a pension nobody updates does not hide. An unknown
  account is never stale: it already says "unknown".
- **The 30-day change per account is gone** from the screen. The card still
  prints the total's change over the line's span, 30 days and a year.
  `AccountRow.change30d` is still derived; nothing renders it.
- **The quiet accounts fold once, at the end** (`quietAccounts`, ADR 0048),
  in the same sections without subtotals. Once rather than per section: a
  quiet account is worth zero or unknown and changes no subtotal, and four
  "N more" rows would be more lines than the accounts they hide. The
  selected account never folds, and each row is still the link to its panel.

**A row is one line.** In the accounts table a name too long for its
column is cut with an ellipsis; in Transactions the description, the
category and the account are too, on fixed columns (the date and the amount
sized for "12 Dec 2025" and "− 12,345.67", the category and the account a
fifth each, the description the rest). The whole text is in the `title`,
and the row is still the link to its panel. A note after a name ("since
2 Jan", "· not counted") is never the part cut. At a phone's width the
accounts table fits its card; Transactions scrolls inside its box under
640 px; the page never scrolls sideways.

**The brand is the way Home.** "PersonalOS" in the top bar is a link to
`/`, named "PersonalOS, home" -- on a phone its word is hidden and its mark,
a 44 px target, keeps the name -- and it is the current page on Home. Home
is no longer a nav item. On a phone the nav items are narrower (8 px side
padding, the same 44 px height), so more of the nav shows before it scrolls.

## Consequences

- No new colour: a section's mark is the allocation bar's, a stale note is
  a caption.
- A row's own date is visible only when it is stale; the account's panel
  still lists every balance with its day.
- Nothing on Home names Home: the brand does, as on most sites.
