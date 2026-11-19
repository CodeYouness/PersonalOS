# 0057. The breakdown lists what the period holds, and its rows add up

- **Status** accepted; amended by
  [0059](0059-finances-shows-only-what-says-something.md): a net refund, or every
  line of a whole that is not positive, shows no Share ("—")
- **Date** 2026-11-19
- **Amends** [0048](0048-finances-reads-at-a-glance.md) (the fold of the
  lines with nothing in the period), [0050](0050-income-and-spending-reads-as-a-circle.md)
  (the breakdown's columns, a parent's own movements),
  [0053](0053-columns-beside-the-breakdown-and-one-tooltip.md) (the change
  from the period before), [0044](0044-spending-over-time-reads-by-the-months-rules.md)
  (the year compared with the same months a year before)

## Context

On real data a month showed a spending category with "Spent −250.70", and
opening it showed one subcategory at 0.00. Two rules met:

- **A parent's own movements had no row.** The only counted movement of the
  month was money in filed on the parent itself -- no subcategory -- in a
  spending category, so a refund, so a negative total. An opened parent
  listed its subcategories only (ADR 0050 sent a parent's own movements to
  its "Movements in" link), so the rows under it did not add up to it.
- **A line stayed for the month before.** A subcategory with nothing this
  month was listed because it had something the month before, and a parent
  was listed whenever it had subcategories (`periodFlows`), so zeros filled
  the table; ADR 0048 folded the ones at zero into "N categories with
  nothing this month".

Looking at it, the owner asked for two more changes: no rows at zero --
except income, where he wants every pay line even in a month it paid
nothing -- and no "vs last month" (or "vs <year>") column.

## Decision

**A line is listed when it holds a counted movement in the period**
(`periodFlows`, the month or the year): a movement `lineHolds` counts --
never a transfer or a movement not counted -- whose part falls in the
period. Not "a total other than zero": a purchase refunded in full nets to
zero but happened, and opening its line shows the purchase and its refund
(hidden as a pair, and said, ADR 0055). Holding is counted where the total
is added (`totalsOver`, `held`), so it costs nothing more and can never
disagree with the total. Each line carries its count, `movements`.

- **Spending**: a top-level line or a subcategory only when it holds one.
  What the period before held does not matter. A parent whose subcategories
  hold nothing and that holds a movement itself has none listed, so it is a
  line without subcategories: its name opens its movements in place.
- **Income: every category and subcategory**, also at zero, so each pay
  line shows in a month it paid nothing. An archived one (it, or its
  parent) only when it holds a movement: archiving takes a category out of
  use (docs/domain.md), and an old pay line at zero every month is noise.
- **Uncategorised**, in either table, when it holds a movement.

**A parent's own movements are a row of their own** (`own`): when a parent
opens into subcategories and something is filed on the parent itself, its
subcategories are followed by a row named "No subcategory" (`ownLine`, an id
of its own, `own:<category>`) with that total and share -- so the rows of an
opened category always add up to it. It is a line like a subcategory: its
name opens its movements in place (`movementLines`, `lineMovements`), and
`lineHolds` holds only what is filed on the parent, none of its
subcategories'. "and N more" and its "Movements with no subcategory" link
list exactly that in the Transactions card (`?category=own:<category>`,
headed "Home with no subcategory", `lineName`). In a year it has its
average month (`lineAverages`).

**No fold.** With nothing at zero in spending, and income's zeros wanted in
view, the row "N categories with nothing this month" folded nothing worth
folding. `foldedLines` and its styles are removed.

**No comparison column.** The breakdown's columns are the line, Share, in a
year the average month, and the amount, last. The month's change from the
month before stays where it is still read -- **the question context** states
each line against the month before -- and moves off the flows the screen
reads: `lineChanges(flows, transactions, categories, month)` gives each
listed line's `previous`, `change` and `changeRatio` by id, for the context
alone. `previous`, `change` and `changeRatio` leave `CategoryFlow`; the
flows' `compared`, and the year's comparison with the same months a year
before (ADR 0044) -- read by nothing else -- are removed.

## Consequences

- No figure changes: totals, shares, the circle, the columns, the
  composition bar, tags and the Transactions card read the same movements.
  The lines dropped held nothing, so added nothing. No schema change,
  nothing stored.
- The question context lists the lines the screen lists, as before: a
  spending line no longer appears at zero for its month before, and every
  income line appears in every month, at zero when it paid nothing, with its
  change from the month before.
- A month no longer says how a line moved against the last. The previous
  month is one step away, and the question context still knows it.
