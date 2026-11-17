# 0048. Finances reads at a glance: net worth over all tracked time, money in and out unmistakable, the rest folded

- **Status** accepted
- **Date** 2026-11-17
- **Amends** [0044](0044-spending-over-time-reads-by-the-months-rules.md) (the chart switch, the net worth line's months),
  [0046](0046-spending-by-tag.md) (the capped list), [0040](0040-home-shows-what-needs-you.md) (Home's money reading)
- **Amended by** [0049](0049-accounts-by-kind-and-the-brand-is-home.md): the
  accounts table is Account and Value in sections by kind, with one date for
  the table; the quiet fold keeps the sections; and by
  [0050](0050-income-and-spending-reads-as-a-circle.md): Income & spending
  is a circle of what came in beside its breakdown, or a table, and its
  figures are a summary under the tables; and by
  [0053](0053-columns-beside-the-breakdown-and-one-tooltip.md): the bars
  left the top of Income & spending for its Columns view, a year's months
  or a month's days

## Context

The owner used the Finances screen on real data -- about twenty accounts,
ninety categories, eleven hundred movements -- and said four things: the net
worth line is meant to show net worth over the whole time it has been
tracked, growing by itself as months are filled in, not twelve months tied
to the month picked for income and spending; they want that line on Home
too; the transactions table does not make clear what is money in and what
is money out; and the screen needs a review.

The review on that data found a page over 11,000 px tall at desktop width:
the net worth line 1,300 px down inside Income & spending, behind a switch;
the add-an-account form between the Net worth card and everything else; the
Categories card alone 4,500 px; a month's transactions 2,800 px; a month's
spending table listing every category with an average, so early in a month
mostly rows of 0.00; dates wrapping onto two lines.

## Decision

**The net worth line covers all tracked time, in the Net worth card.**

- One derivation, `worthChart(history, today)`: the months it covers are
  every month of the monthly history (`worthMonths`) -- from the first value,
  or "tracked since", to today's month -- read through `worthTrend` and
  drawn by `worthLine`, as before. It reads no `?month=` and no `?period=`,
  and a new month joins it by itself.
- It sits in the Net worth card under the headline, before the allocation
  and the accounts, with the change over its whole span, over 30 days and
  over a year printed under it -- signed, no state colour, as ADR 0044 drew
  it.
- **It fits the width; it never scrolls.** One stretched SVG, a point at
  each month's middle; with twelve months or fewer each month has a dot,
  past that only the newest month and a month alone between two gaps keep
  one. No month is a link: the chart selects nothing.
- **Its labels thin out** (`worthTicks`): the finest step -- every month,
  the quarters (January, April, July, October), the half years, each
  January, then every second, fourth and eighth January -- that puts at most
  `WORTH_TICKS_WIDE` (12) labels under a wide chart and, among those, at most
  `WORTH_TICKS_NARROW` (4) under a narrow one; the CSS hides the others at a
  phone's width (760 px and under). Each step is a multiple of the one
  before, counted from January, so the narrow labels are a subset of the
  wide ones. The year is written under each January and under the first
  label of each width, so it is always named.

**The chart switch is gone** (amends 0044). Income & spending draws only
its income and spending bars, over its own months (`trendMonths`, or the
year's), each month still a link that reads it. `?chart=` is no longer read
or written: `FinancesChart`, `financesChart` and the parameter left the
address, and an old `?chart=flows` is ignored, never an error.

**The line on Home**, under the four tiles, the whole row wide, as part of
the money reading: one sentence -- "Net worth + 3,200 since 31 Jan" -- and
the same chart, compact, the whole of it one link to Finances. Under the
tiles rather than inside the money tile: a line needs width, and at 390 px a
tile is about 175 px wide while the row is the column's width, and the two
by two of the tiles stays as it was. Absent while there is no net worth to
draw. The same `worthChart` as Finances, from the `financeOverview` Home
already reads: no second implementation, no model, no integration.

**Money in and money out are unmistakable.**

- Transactions: a movement's amount is signed from its account's side to the
  cent (`formatMoneyChange(amount, { cents: true })`): "+ 12.40" in the up
  tone for money in, "− 12.40" in the ink for money out. The sign is always
  printed, so colour is never alone. A movement not counted keeps its sign
  in the subtle ink. A transfer shows the amount moved, unsigned and
  subtle, its Account cell naming both ends ("Current → Savings").
- The bars: money in is an outlined bar, money out a solid one, always in
  that order, so the two tell apart without the legend; the legend shows
  the same swatches, "Income, money in" and "Spending, money out".
- The category tables head their total "Spent" and "Received", not "Total".
  The account panel shows balances, owed amounts and buy or sell trades:
  nothing there could be read either way, and it is unchanged.
- Dates in every finance table never wrap.

**What folds.**

- **A table's lines with nothing in the period** (`foldedLines`): a
  category listed for its average, last month's money or its subcategories,
  at a total of zero, goes into one row at the end of its table -- "N
  categories with nothing this month" (or "this year") -- which opens to
  show them with their averages, by itself when the selected line is one of
  them. Both tables. The composition bar and the shares are unchanged.
- **Quiet accounts** (`quietAccounts`): an account worth zero or unknown
  with nothing recorded on it -- a movement (either end of a transfer), a
  balance or a trade -- from `limits.financeQuietAccountDays` (90) days
  before today to today folds under "N more accounts", a second table with
  the same fixed columns. The selected account is always shown. **Amended
  by 0049:** two columns, Account and Value, in sections by kind; the fold
  comes once, at the end, in the same sections without subtotals.
- **The month's list is capped too**: `limits.financeYearListMax` became
  `limits.financeListMax` (50), and a month with nothing selected lists its
  newest 50 like a year, saying "The newest 50 of 96 in March 2026" with a
  link to show them all. That link reuses `?span=all`: with a tag it was
  already "every movement of the tag"; with nothing selected it is "every
  movement of the period". Once all are shown, a link offers the newest
  only. A selected line or tag is listed whole, as before (amends 0046).
- **Movements without a category**: when the period has counted movements
  on no category (`uncategorisedCounts`, the ones the Uncategorised lines
  hold), one line at the top of Income & spending says how many and links
  to review them -- the Uncategorised line of spending, of income, or one
  link each.

**The order, top to bottom**: Net worth (headline, line, allocation,
accounts) with the selected account's panel beside it -- the card takes the
whole row when none is selected; Income & spending, the whole row; By tag
and Transactions, with the panel that records a movement or shows the
selected one beside them; and **Manage**: add an account, the categories,
the settings, each a `<details>` folded to its head, side by side where they
fit. A fold needs no client state and works on the server-rendered page.

**What opens Manage.** The address carries `account` and `transaction`, and
both open a panel beside the card they are picked from -- the accounts table
and the list -- not under Manage, so a click never opens something out of
sight. Nothing in the address belongs to the three parts of Manage, so a
part opens by itself only when it is the first thing to do: adding an
account while there is none, the categories while there are none. After an
account is added the page goes up to its new panel.

**Tables scroll in their own box** (`.finance-table-scroll`), never the card
or the page, so at 390 px nothing scrolls sideways but a table.

## Consequences

- The Net worth card and Home draw the same months; the question context,
  which reads the history, is unchanged.
- A long history draws as a line without a dot per month; the visually
  hidden list under the chart still names every month's value.
- The selected transaction's panel sits beside Transactions, below Income &
  spending: a citation that opens one lands at the top of the page, and the
  panel is a scroll away. The panel is not sticky.
- `?span=all` without a tag persists while you move between months, as a
  tag's did; the newest-only link turns it off.
- The ninety categories are still edited one row each once Categories is
  opened; only the fold keeps them off the screen until then.
