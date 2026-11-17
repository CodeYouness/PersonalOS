# 0044. Spending over time is read by the month's rules, and a year is compared like for like

- **Status** accepted; amended by [0046](0046-spending-by-tag.md) and
  [0048](0048-finances-reads-at-a-glance.md), which removes the chart switch:
  the net worth line moved to the Net worth card and covers all tracked time,
  and Income & spending draws only its bars
- **Date** 2026-11-17

## Context

The Income & spending card (#137) read one month at a time. The spreadsheet
it replaced also showed spending over time: a trend of income, spending and
saving month by month, the composition of spending by category, each
category this month against its usual month, and the same reading for a
whole year. Each of those is a number that needs a rule nobody wrote down
yet: what an "average month" averages over, what a month with nothing in a
category counts as, what "a year" is when the year is not over or tracking
began in the middle of it, and what a year is compared with.

Seen as bars, the trend answered how money flowed each month but not where
it left you: what was asked of it first was how net worth grows over time,
with the bars kept beside it. Net worth month by month already existed --
the History card's table -- and a line of it needs a scale rule nobody had
written either.

`yearFlows` already existed, and was the obvious place for a year. It is
the twelve months ending with a month -- the "Saved over 12 months" rate the
card and the question context both show.

## Decision

- **One implementation.** `periodFlows` reads any list of months by the
  month's rules -- transfers and not-counted money out, a refund reducing
  spending, fixed vs variable by each movement's own category -- and
  `monthFlows` is it for one month compared with the month before. The year
  reading, the trend and the average all read through it or through
  `monthFlows`, so a year is the sum of the months its trend draws.
- **`yearFlows` keeps its meaning.** A calendar year to date and the twelve
  months ending with a month are different numbers; turning one into the
  other would change a figure the question context cites. The year reading
  is `calendarYearFlows`, beside it, on the same core.
- **A year is its months on offer**: the selected month's calendar year,
  from January or "tracked since" to December or today's month. A month
  before "tracked since" is not part of it, as it is not on offer.
- **A year is compared like for like**: with the same months a year before,
  January to November against January to November -- never a part year
  against a whole one, which would read as a fall every year until
  December. Only when every one of those months was on offer and something
  was counted in them; otherwise the change is blank, not a change from
  zero.
- **The average month** of a spending line reads the months on offer before
  the selected one, at most twelve, a month with no movement in the line
  counting as zero: the month was tracked, so nothing was spent. With fewer
  than three such months it is not shown -- one or two months are a
  coincidence. Its window does not include the selected month, so the month
  is not compared with itself. It is shown in the month reading only.
- **The trend** draws the newest twelve months on offer while the selected
  month is among them, so picking one of them does not move the rest, and
  otherwise the twelve ending with it. A month with nothing counted is an
  empty slot, never a bar of zero.
- **The trend has two charts, net worth first.** Over the same months, a
  switch above the trend draws net worth at each month's end as a line --
  the default, since how net worth grows is the question most often asked
  of it -- or income and spending as bars. The choice is in the address,
  `?chart=flows`, in the style of `?period`: the default is never written,
  so every address from before reads the line, and every link that spreads
  the place keeps it. It combines with Month / Year: both charts cover the
  trend's months in a month and the year's in a year.
- **The line reads the history; it is not a second net worth.** `worthTrend`
  takes the month-end values from `financeOverview`'s history -- the month
  still running as of today -- so the line and the History card cannot
  disagree. A month the history does not draw (before the first value,
  before "tracked since", after today) is unknown: a gap in the line and an
  outlined slot, never a zero.
- **The line's scale is its own lowest and highest value, not zero, with a
  floor.** A line is read by its slope and position, not by its length, and
  from zero a year that grew by 5% is a flat line. A scale fitted to the
  values alone would draw a few hundred euros on a hundred thousand as a
  cliff, so the scale spans at least a tenth of the largest value
  (`WORTH_MIN_SPAN`), widened evenly around the values. Because the bottom
  is not zero, it is printed: the scale's bottom and top sit in a column
  beside the chart, and the newest value and the change from the first
  known month are written under it. The bars keep zero at the bottom -- a
  bar is read by its length -- and the same column prints their top.
- **Switching moves nothing.** Both charts share the row of month links,
  their labels and the scale column, so the hit areas stay where they were.
  The months sit edge to edge, so each month's middle -- where the line's
  point is -- falls at an even step and the line can be one stretched SVG.
- **The trend opens at its newest end.** On a phone the months scroll
  inside the card. The scroll box runs right to left, so CSS alone opens it
  at its newest month, before any script runs; the months still read left
  to right. A selected month further back is brought into view by a ref
  callback that moves that box, never the page -- the card remounts on
  every month picked, so without it the month just tapped would scroll away.
- **No chart library.** Inline CSS marks and one inline SVG in the existing
  tones: the series tones for parts of a whole and for the two flows, the
  ink for what was left and for the net worth line, hairlines for its
  scale, and no state colour -- spending above its average is not an error,
  and a fall in net worth is read from the line, not from a colour.

## Consequences

- The question context still answers per month and per twelve months; it
  has no year-to-date figure and no average. Adding them means calling
  `calendarYearFlows` and `spendingAverages` with the screen's arguments.
  **Amended by 0046:** the year to date is a figure now; the average is not.
- A year's transaction list, with no line selected, is the whole year's.
  **Amended by 0046:** the newest 50, and how many more.
- The window and the threshold are constants, `AVERAGE_MONTHS` and
  `AVERAGE_MIN_MONTHS` in `lib/domain/derive/finance.js`; the trend's length
  is `TREND_MONTHS`; the line's least span is `WORTH_MIN_SPAN`.
- The net worth line and the History card show the same month-end values:
  the line twelve months of them, the card every month since tracking began,
  with each month's change. Whether the card still earns its place is open.
- The line inherits the history's reading of an account with no value yet:
  it is left out, so the month an account gets its first balance is a step
  in the line that is not growth. **Amended by 0046:** a month-end with no
  account valued at all is a gap in the line, not a zero.
