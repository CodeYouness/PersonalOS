# 0050. Income & spending reads as a circle of what came in, beside the breakdown

- **Status** accepted; the circle view and a line's movements amended the
  same day (below), and what a month counts by
  [0052](0052-a-movement-counts-in-the-months-it-is-for.md); amended by
  [0053](0053-columns-beside-the-breakdown-and-one-tooltip.md): the
  breakdown is always on the right and the table view is gone, the left a
  Circle / Columns switch (`?view=columns`) with the totals and the summary
  under the chart, and the strip of bars across the top is gone; amended
  by [0057](0057-the-breakdown-lists-what-the-period-holds.md): no change
  column, the lines that hold a movement in the period (every income line),
  and a parent's own movements a row of their own, "No subcategory";
  amended by [0060](0060-income-and-spending-reads-its-parts.md): Fixed and
  Variable are one line, "Of the € 751.41 spent: fixed costs € 227.94 · the
  rest € 523.47"
- **Date** 2026-11-17
- **Amends** [0044](0044-spending-over-time-reads-by-the-months-rules.md) (the average month, the composition bar),
  [0046](0046-spending-by-tag.md) (a line listed for its average),
  [0048](0048-finances-reads-at-a-glance.md) (the card's figures and tables)

## Context

The owner looked at the Income & spending card with real data and found it
uncomfortable to read: a row of five big figures under the bars, a
composition bar, then two wide tables -- spending first -- each with a
total, an average and a paired mark, a share, a change in euros and a
change in percent. They asked for:

1. A circle instead of a table: the month's income is the whole, split
   into what was spent, what was invested and what was left to them, and
   spending beyond the income drawn red outside the circle.
2. The circle on the left and the breakdown of the movements on its
   right, for a month and for a year.
3. A choice, for both, between the table and the circle.
4. Hovering a part shows it.
5. The figures under the chart moved to the right, under the spending
   rows, as a final summary, with income before spending.
6. Average only in the year view; no "%" column; Share kept, and the
   amount last, far right.
7. Clicking a spending line's name opens its subcategories and what was
   spent in each.

"Invested" was not a number the screen had: a trade changes what you hold,
not money in or out (`Trade` in docs/domain.md), and payments to a broker
are filed as transfers or not counted (ADR 0042).

## Decision

**What was invested is read from the trades** (`periodInvested(trades,
months)`): every trade dated in the period, on any holding -- only an
investment is valued by units, so every trade is on one -- a buy at what it
cost (`valueOfUnits(units, price)`, rounded half up to the cent, plus its
fee), a sell at what it brought back (the same, less its fee). Invested is
bought less sold. Nothing is stored and nothing is flagged: a trade already
holds its units, price and fee in EUR. A payment to a broker is a transfer
or not counted, never spending, so the money is not counted twice. A merger
or a move of units between brokers is a sell and a buy on one day (ADR
0031) and nets to zero when the broker reports both at one value.

**The circle** (`flowCircle(flows, invested)`) is the period's income, split
clockwise from the top into three parts:

- **Spent**: the period's spending (a period of net refunds spent nothing),
  drawn up to the income.
- **Invested**: bought less sold, never below zero -- a period that sold
  more than it bought invests nothing and the summary says "Sold € X more
  than bought" -- drawn up to what spending left of the income. What it
  invested beyond that came from earlier savings, and the summary says
  "€ Y of it from earlier savings" (or "All of it" when spending already
  took the whole income).
- **Kept**: income less spent less invested, never below zero.

Invested and kept together are what was saved, the savings rate's
(income − spending), whenever spending stays within the income and the
investment within what it left. **The savings rate and the target (ADR
0045) are unchanged**, and so is every figure the question context cites.

**Overspending** -- spending beyond the income -- is an arc outside the ring,
from the top, its length the excess as a share of the income, in the danger
tone: it is a state of the period, and the owner asked for red. Past twice
the income the arc is a full outer ring; the amount, not the arc, says how
far past. Never colour alone: the centre and the summary say "Spent € X
more than came in". **Without income** the ring is an outline with nothing
on it, and the centre says "Nothing came in" and what was spent. **Nothing
recorded** (no income, no spending, no trade) keeps the empty state's one
line, and no circle.

**The circle is drawn by one tested geometry**: `flowCircle` gives each part
its start and end in turns, `circleArc` turns them into an SVG arc (a full
turn as two halves). One inline SVG, no chart library, in the three series
tones: spent in the ink, as money out is in the trend; invested and kept in
the lighter two.

**Hover and focus.** Each drawn part is focusable, has a native title and is
named "Spent € 1,500, 50% of income". Hovering or focusing one draws it
thicker and dims the others (opacity is the only thing that changes over
time), and the centre shows its name, amount and share instead of what came
in. Hovering a part's row in the summary does the same. The SVG is a group
named by what came in and its three amounts; the centre is hidden from a
screen reader, which has the parts' names and the summary.

**The card, top to bottom**: the head -- Month / Year, the picker, and a new
**Circle / Table** switch; the line counting movements without a category;
the bars, unchanged; and the body. **The view is in the address**,
`?view=table`, in the style of `?period`: the circle is the default and never
written (`financesView`), and every link that spreads the place keeps it.

**The body.** In the circle view, the circle on the left and the breakdown on
its right, stacked under 560 px. **Amended below:** the circle view has no
table. In the table view, the breakdown alone, the
whole width, with the composition bar of spending (`spendingParts`) above the
spending table and its colours on the spending lines. The breakdown is:

- **Income first, then spending**, then **the summary** as the final account,
  a compact list aligned right: Income, Spent, Invested, Kept (each with its
  swatch in the circle view -- **amended below**: in the circle view these
  four sit under the circle, and Income has no mark), the savings rates
  against the target, the year's shortfall, Fixed and Variable. The five-figure row under the bars is
  gone; its numbers are here.
- **Columns.** Circle view: name, Share, the amount (Spent or Received)
  -- **amended below**: the circle view has no table.
  Table view, a month: name, Share, vs last month, the amount. Table view, a
  year: name, Share, Average, vs <last year>, the amount. The amount is
  always last. The "%" change column is gone everywhere.
- **The average is the year's only** (`lineAverages(year)`): each line's
  total over the year's months on offer, a subcategory and Uncategorised
  included, a month with nothing counting as zero, rounded to a cent; a
  caption under the table says over how many months. **The month's average
  is gone** -- the twelve months before, the paired mark, its caption, and
  the lines of zero listed for their average (ADR 0046). `spendingAverages`,
  `averageMark` and `spendingLinesWithAverage` were removed with them:
  nothing read them any more.
- **A line's name is its control.** A line with subcategories is a button,
  ▸ before its name, `aria-expanded`, that opens them with what was spent
  in each and, at the end, a quiet "Movements in <line>" link that lists the
  line's movements (`?category=`, unchanged). A line without subcategories
  has no mark, and its name is the underlined link to its movements, as
  before. A selected line, or a selected subcategory, opens its parent.
  **Amended below:** a subcategory's name, and a line's without any, opens
  its movements in place.
- The fold of lines with nothing in the period (`foldedLines`) and the line
  of movements without a category stay where they were.

Everything holds at 390 px: the circle scales down, the circle view's three
columns fit, and the table view's wider tables scroll inside the card.

## Amendment: the circle view without the table, and movements in place

Looking at the circle view on real data, the owner asked for four changes:

1. With Circle selected the table is not shown: the income and spending
   rows are the table view's only.
2. The four totals -- Income, Spent, Invested, Kept -- go under the circle,
   to make the section shorter.
3. Their marks are coherent with the circle: "Income with a green border"
   matched nothing in it.
4. After opening a category, a subcategory opens too, to see its movements
   right there.

**The circle view** is two columns, side by side down to 560 px and stacked
under: on the left the circle and, directly under it, the four totals
(`CircleTotals`), two by two where the column takes two of 110 px and a
short list otherwise, each a label over its amount in whole euros, as the
ring's parts are named; on the right the rest of the summary -- the notes
(spent beyond the income, invested from earlier savings, sold more than
bought), the savings rates against the target, the year's shortfall, fixed
and variable. No income or spending row, no table, no composition bar.
Nothing recorded keeps the empty state's line alone.

**The marks** are the parts' own: Spent, Invested and Kept each carry exactly
the tone of its part of the ring (`--series-1/2/3`). Income is the whole
ring and has **no mark** -- a tiny ring beside it would be one more symbol to
decode for no information. The outlined swatch stays where it means
something: the trend's legend, money in. Hovering a total emphasises its
part, as a summary row did.

**The table view** keeps the rows, the composition bar and the comparison
columns, followed by the whole summary -- income, spent, invested, kept,
each with its note, then the rates, the shortfall, fixed and variable -- as
before, with no swatch: there is no circle to match.

**A line's movements in place.** A line's name with subcategories opens them,
as before. A **subcategory's name is now a disclosure too** (▸, `aria-expanded`,
28 px as the line's), and so is a top-level line's with no subcategories and
the Uncategorised lines': it opens that line's movements of the period
right under it -- the day, the description (the link to its panel) and the
amount, signed and toned as the Transactions card signs it (`MovementAmount`,
shared, one implementation) -- newest first, at most `limits.financeListMax`,
then "and N more" linking to the line's listing (`?category=`), or
"Movements in <line>" when nothing was left out. The parent's own "Movements
in <line>" link stays. A selected line opens its movements by itself, as a
selected subcategory opens its parent. A line with nothing in the period
says "No movements this month" (or "this year").

**The movements come from one derivation**, `lineMovements(transactions,
categories, { months, lines, max })`: what `lineHolds` counts, in the
period's months -- a movement counted over several months (ADR 0052) with
its part in them -- for the lines `movementLines(flows)` names (each
subcategory, each top-level line without any, both Uncategorised lines).
The page computes it, and only in the table view; the component filters
nothing. The payload is each line's newest few, five fields a row: id, the
day, the description, the amount and, for a spread movement, which of its
months it is.

**Consequences of the amendment.** The circle view is shorter by both
tables. A parent's own movements -- filed on it, not on a subcategory -- are
reached by its "Movements in" link, not in place: the in-place list of a
line is what its row's total counts, and a parent's row counts its
subcategories too.

## Consequences

- A merger whose two legs the broker values differently, or units that
  arrive from a broker that is not tracked, read as money invested in that
  month: a trade does not say it was a custody move. If it matters, the sync
  would have to keep the broker's movement type on the trade's origin
  (`origin.detail`) so `periodInvested` could leave those out.
- A spending category the owner uses for broker payments and leaves counted
  would be spent and invested at once. ADR 0042 files them as not counted;
  the card does not check.
- The month no longer says whether a line is above or below its usual
  month. The question context never had the average, so nothing it says
  changes.
- `Kept` is not `Left`: what was left after spending (the trend's tick, the
  target's shortfall) is invested plus kept.
