# 0053. Income & spending draws columns beside the breakdown, and a chart's marks show their figures in one tooltip

- **Status** accepted; amended by
  [0057](0057-the-breakdown-lists-what-the-period-holds.md): the breakdown
  has no change from the period before, and lists what the period holds
- **Date** 2026-11-17
- **Amends** [0050](0050-income-and-spending-reads-as-a-circle.md) (the card's
  body, the view switch, the table view), [0044](0044-spending-over-time-reads-by-the-months-rules.md)
  and [0048](0048-finances-reads-at-a-glance.md) (the trend's bars),
  [0049](0049-accounts-by-kind-and-the-brand-is-home.md) (Transactions
  scrolling in its box)

## Context

Looking at the live Finances page, the owner said three things.

1. **Income & spending.** The amendment of ADR 0050 removed the category
   rows from the circle view; that was a misunderstanding. What they wanted
   gone was the strip of twelve-month bars across the top of the card, with
   its legend. They want the breakdown -- income lines, then spending lines,
   a category opening its subcategories, a subcategory opening its movements
   -- always on the right, and on the left a choice between the circle and
   columns: the days of the month, or the months of the year, each column
   telling its exact figures.
2. **The Net worth card.** Each point of the line should tell its month and
   its net worth, and each part of the allocation bar which accounts make it
   up and how much each is worth -- on hover, on keyboard focus and on a
   phone.
3. **Transactions** scrolled sideways: on a desktop pane, and in a narrow
   one it cut both a description and its note.

A `title` reaches neither a keyboard nor a finger, and three hover
mechanisms would be three to get wrong.

## Decision

**The card's body is two columns**, side by side while the card is wider
than 720 px and stacked under -- measured on the card (a container query),
not the window: the card's width is what the two columns share.

- **On the right, always, the breakdown**: what ADR 0050's table view
  showed -- income, the composition bar, spending; the change from the
  period before, and in a year each line's average month; a line's name
  opening its subcategories, a subcategory's (or a line's without any)
  opening its movements in place. `lineMovements` is now computed on every
  load, since the breakdown always shows.
- **On the left**, a switch, **Circle / Columns** -- `?view=columns`; the
  circle is the default and never written; the `?view=table` of ADR 0050
  reads as the circle, never an error -- then the chart, then the four
  totals (income, spent, invested, kept, whole euros as before) and under
  them the rest of the summary: the notes, the savings rates against the
  target, the shortfall, fixed and variable. Nothing the card said is gone
  but the strip: the table view's summary had the four totals to the cent;
  they are in whole euros under the chart, and the breakdown's lines keep
  the cents.
- **The strip across the top is gone**, with its legend, its own scroll box
  and `trendMonths` (the twelve months around the selected one), which
  nothing reads any more. Under the columns the four totals are the legend:
  income with the outlined mark, spent with the solid one; under the circle
  they keep the ring's tones, income unmarked.

**The columns.** Money in outlined, money out solid, in the old bars' tones,
on a scale from zero to the highest bar printed beside them
(`trendBars`, `trendHigh`, now for any column -- **amended below**: a
month's days have their own scale). They fit the column, never scroll.

- **A month: one column per day** (`dayColumns(transactions, categories,
  month, todayKey)`), by the month's own rules -- `countedFlow`, so
  transfers and movements not counted are out and a refund reduces its day's
  spending. A day draws only the bars it has money for, so a day of spending
  is one bar the column's width (**amended below**: income is a mark, not a
  bar). Every day of the month is a column, the 1st,
  8th, 15th, 22nd and 29th labelled. A day after today is an empty slot, not
  a column of zero, and is not focusable -- unless something is already on
  it, which is drawn.
- **A movement counted over several months has no single day** (ADR 0052).
  A day is the day money moved, and a part of a month is not a part of a
  day; putting the November third of a salary paid on 12 November on the
  12th would draw a payday of a third of a salary, and a September third
  has no day in September at all. So a movement is on its day only when it
  counts whole in the month of its date (no `countedOver`, or one naming
  only that month); every other part in the month is **apart**, and the card
  says it under the columns: "€ 300.00 in from 1 movement counted over
  several months, on no single day: in the totals, not in the columns." The
  days and what is apart add up exactly to the month's income and spending
  -- tested against `monthFlows`.
- **A year: its twelve months** (`yearColumns(transactions, categories,
  year, offered)`), each month the year offers read by `flowTrend` -- the
  same months `calendarYearFlows` adds up, so the columns add up to the
  year -- income and spending side by side with what was left as a tick on
  the income bar, as the strip drew it. A month on offer is a link that
  reads it; one with nothing counted is an outlined slot; a month the year
  does not offer (before "tracked since", after today) is empty and no link,
  even if a spread movement has a part there -- ADR 0052 already shows no
  month that is not on offer. Labelled by quarter.

**One tooltip** (`components/Tip.js`): the way a chart's mark shows its
figures, used by the columns, the net worth line's points and the
allocation bar.

- The mark is the control: focusable, named by everything the popover says
  (a link stays a link), so a screen reader needs nothing more and the
  popover is hidden from it.
- It shows on hover with a mouse (pointer events, so a tap's emulated mouse
  events do not open it), on focus from a keyboard (`:focus-visible`), and
  on a tap: on a link the first tap shows the figures and the second follows
  it; on any other mark a tap toggles them. A tap elsewhere, Escape, a scroll
  or a resize hides it; one is open at a time.
- It is drawn in a portal on the body, `position: fixed`, above the mark --
  below it when there is no room -- and kept 8 px inside the viewport: no
  card's overflow clips it and, fixed, it adds nothing to the page's scroll.
  No dependency.

**The net worth line**: on the Net worth card each month with a value is a
focusable column of the plot showing its month, its net worth to the cent
and the day it is read on; its dot shows while it is hovered or focused when
the line does not already carry one. An unknown month stays a gap with
nothing to show. Home's compact line is unchanged: it is one link.

**The allocation bar**: each part, and its legend's item, shows the part and
its accounts with their values, largest first (`allocationAccounts`, built
on `accountSections` over every active account, so a part, its section's
subtotal and its accounts are one reading; each holding is its own account,
as the table lists it). An account with an unknown value is left out and
counted -- "1 account with no value, not counted" -- since unknown is not
zero; one worth exactly zero makes up nothing and is not listed. The bar no
longer clips its parts (its ends are rounded on them), so a focused part's
ring is whole.

**Transactions never scroll sideways.** The cause was the table's
`min-width: 640px` (ADR 0049): its box scrolled whenever the card was
narrower -- beside the panel at a window of about 1,200 to 1,240 px, and on
any phone or tablet. Now the date and the amount are as wide as their
longest text, never wrapped or cut; the description, the category and the
account share the rest (a half and two quarters), each cut with an ellipsis
and its head with it. Under 600 px of card the account column goes, under
440 px the category too, with tighter cells; the description's title then
names both ("Lunch — Restaurants · Current"), and the movement's panel has
them. Measured on the card, a container query.

**The breakdown's tables** take the same approach: the numbers as wide as
their text, the name the rest and at least 7.5em. In a narrow breakdown a
month's table fits a phone; a year's five columns keep their names readable
and scroll inside their own box there, as ui-rules allows a wide table to,
never the card. A line's name in its toggle is now cut inside the button, so
a long name no longer collapses to "…".

## Amendment (2026-11-18): a month's days on the spending's scale, income a mark, and the card's controls

On real data a month's day columns said nothing: the salary arrives on one
day, thousands, and a day's spending is tens, so on one scale every spending
column was a pixel high. Income and spending are comparable over a month --
the year's twelve columns stay as they were -- but not day by day.

- **The days' scale is the largest day's spending** (`dayHigh`), and the
  scale beside the columns prints it. A day of rent is on it as tall as it
  is: that is honest, so no cap and no log scale. A spending of a few euros
  beside it is still drawn, at least 2 px.
- **Income is not drawn to scale.** A day with money in carries an outlined
  dot -- the outlined tone money in has -- in a strip above its column, a
  marker, not a bar (`dayBars`: each day's spending height and whether it is
  marked; a net chargeback is no mark). Its amount is in the day's tooltip
  and its name exactly as before. A day with only income is still a column,
  focusable, with its tooltip.
- **A day is marked only from 1% of the month's income.** On real data a
  deposit's daily interest, a few cents, put a mark on almost every day, and
  the marks no longer said where the money came in. The floor
  (`dayMarkFloor`) is `limits.financeDayIncomeMarkPercent` -- 1, a whole
  percent -- of the month's income as its totals count it (what is on no day
  included), **rounded up to a whole euro** in integer arithmetic on minor
  units, so the figure the card prints is the rule exactly: € 4,886 in makes
  € 48.86, a mark from € 49.00. A month with no income, or with more charged
  back than received, has no floor and no mark. The day's tooltip and name
  still give its income, whatever its size.
- **The card says it once**, under the totals that are the legend: "Income
  of € 49 or more is marked on its day, not drawn to scale." -- only when a
  day carries a mark. The Income total's swatch is a dot there, as the mark
  is, and none when no day is marked; under a year's columns it stays the
  outlined square of its bar.
- **A month with income and no spending** draws marks only, on a scale of
  zero that divides by nothing, and the scale prints "€ 0" alone, no top.
- **The day columns are taller** (180 px, from 140, with the marks' 14 px
  strip above them) -- thirty-one marks wide, they were cramped. They already
  spanned the left column: the days still to come are empty slots, so a
  month half gone looked half drawn. Unchanged: the days and what is apart
  still add up to the month's totals, and the "apart" sentence is the same.

Looking at the card again the same day, the owner found its controls
confusing and plain -- Month / Year and the month's select in the head, then
Circle / Columns as two more detached buttons above the chart: two rows of
look-alike buttons meaning different things -- the four totals hard to read,
each label far from its value, and the composition bar silent.

- **One toolbar in the card head**, wrapping on a narrow card, never
  scrolling sideways, with two kinds of control (docs/design/ui-rules.md,
  Segmented controls and steppers). **The period**: a joined Month / Year
  segmented control, followed by a stepper -- previous and next arrows
  around the period's select ("‹ November 2026 ›"), the select still
  choosing any month directly; previous is disabled at the oldest period on
  offer and next at the newest, and in a year they step years, each read at
  its newest month on offer as the select does. **The view**, apart from it:
  a joined Circle / Columns control, a ring and three bars before the words,
  absent when there is nothing to draw. The Circle / Columns buttons above
  the chart are gone. Every address is as before: `?period=year`,
  `?month=`, `?view=columns` never written for the circle, `?view=table`
  read as the circle; a step, like the select, leaves a selected movement.
  The joined control is `components/Segmented.js`; the Transactions card's
  period / All time switch, the screen's one other link choice, uses it too.
- **The four totals are rows**: each one tight unit -- its mark, its name and
  its amount right-aligned -- two by two, in the summary's row style and at
  its width, so they and the rates, fixed and variable under them read as
  one account, in two rows where there were four lines. A total without a
  mark keeps a mark's place, so the names line up; a cell too narrow for its
  row puts the amount under the name. The marks mean what they meant: the
  ring's parts, or under the columns their legend.
- **The composition bar's parts show their figures** in the one tooltip,
  as the allocation bar's do: each part focusable, named and showing its
  category, what it spent and its share of the period's spending
  (`spendingParts` now gives the amount), in a month and in a year. A part
  too thin to point at is still a tab stop, and its line in the spending
  table says the same. The bar is a group named "Spending by category", no
  longer one image naming every share.

## Consequences

- Loading the page computes the line movements every time, and the columns
  only in the columns view. Nothing calls the model or an integration.
- A month's day columns and its totals disagree by exactly what is apart,
  and the card says how much. A week, by date (ADR 0052), still counts a
  spread movement whole on its day.
- A day column is about 8 to 15 px wide: a mark among thirty-one, like a
  heat-map cell, reachable by keyboard and by its popover. Thirty-one tab
  stops in a month's columns, twelve in a year's.
- The net worth line's points and its visually hidden list of months both
  name each month to a screen reader; the list also names the unknown ones.
- A phone loses the Transactions card's Category and Account columns; they
  are one tap away.
- The table view, its switch value and `trendMonths` are gone; an old
  address keeps working.
