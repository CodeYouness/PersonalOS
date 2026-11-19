# 0046. Spending by tag is read by the month's rules, in a card of its own

- **Status** accepted; amended by [0048](0048-finances-reads-at-a-glance.md):
  a month with nothing selected is capped too (`limits.financeListMax`), with
  `?span=all` to show them all; and by
  [0050](0050-income-and-spending-reads-as-a-circle.md): a month has no
  average any more, so no line is listed for one; and by
  [0058](0058-the-transactions-card-reads-a-month-and-searches.md): the movement open in
  the panel is never left out of the list beside it
- **Date** 2026-11-17

## Context

A transaction has `tags` (ADR 0023): the user's own labels, a trip, a
project, "work expenses 2026". The spreadsheet the Finances screen replaces
showed spending per tag; the screen showed nothing. A tag is not a category:
a movement has one category and any number of tags, and a trip spans months
and categories.

The last review of the Income & spending card (ADR 0044) also left limits
this ticket settles: a category with nothing this month or last was not
listed, so it never read as under its average; a month with nothing still
printed the caption explaining the average; a year with nothing selected
listed every transaction of the year; a month where no account had a value
at its end drew as zero on the net worth line; and the question context had
no year-to-date figure.

## Decision

**Tags.**

- **By the month's rules** (`tagFlows`): a transaction's spending and income
  are read by `countedFlow`, the one reading `totalsBetween` -- and so a
  month, a year and a week -- adds up: transfers and movements not counted
  are left out, a refund reduces spending, a chargeback income. For the
  period Income & spending reads (the month, or the calendar year to date):
  each tag with a counted movement in it, its spending, income and number of
  movements, largest spending first, then by name -- and, since a trip
  rarely fits one month, its totals over all time and its first and last
  day.
- **A movement with several tags counts under each.** Tag totals do not add
  up to the period's spending, and the card says so.
- **A card of its own, By tag**, between Income & spending and Transactions,
  not a third table in Income & spending: the category tables there add up
  to the period's spending, and tags set beside them would read as parts of
  the whole. It reads the same period, which its head names. Columns: tag
  (with its first and last day under it), movements, spent in the period,
  spent over all time. It is not there at all when no movement has a tag;
  with tags but none counted in the period, it says so in one line.
- **Selecting a tag** (`?tag=<tag>`, encoded by the address) lists its
  movements in the Transactions card -- only the ones it counts
  (`tagHolds`), so the list is as long as its count of movements -- with a
  switch to all of them whatever the period (`?span=all`, written only with
  a tag; the period's is the default and never written). A tag no movement
  carries selects nothing.
- **One selection at a time.** Picking a tag clears a selected category
  line, and picking a line clears the tag: each list then matches the row
  that was clicked, which an intersection would not. An address with both,
  typed by hand, keeps the line.

**The review's limits.**

- **A spending line with an average is listed in a month with nothing in
  it** (`spendingLinesWithAverage`): every top-level spending category, and
  Uncategorised, whose average is above zero, at a total of zero, with no
  share and no change, set against its average. Composed where the card
  builds its table; `monthFlows` -- which the question context reads -- is
  unchanged, and so are its figures.
- **The average's caption is printed only under a spending table with
  rows**, "No average yet" included.
- **A year with nothing selected lists its newest
  `limits.financeYearListMax` movements** (50) and says how many more there
  are and that a month, a category or a tag narrows it
  (`listedTransactions`). A month is listed whole, and so is anything
  selected. This amends ADR 0044's "a year's transaction list is the whole
  year's".
- **A month-end with no account valued is a gap in the net worth line, not
  a zero.** A history row now carries how many accounts were measured at its
  end (`measuredAccounts`), and `worthTrend` reads a row with none as
  unknown. The history keeps its zero: the History card, Home's sparkline and
  the question context read it as before, so their figures do not change --
  and for that month the line and the History card disagree, the line
  showing a gap where the card lists 0. Changing the card is a change to a
  figure the context cites, and is left to a ticket of its own.
- **The question context gains the calendar year to date** -- income,
  spending, what is left and the savings rate, `figure:<what>:<YYYY>-ytd`,
  through `calendarYearFlows` with the card's arguments -- **and the tags of
  today's month and of the year to date**, `figure:tag:<period>:<key>`. The
  key spells a tag in the characters a figure id allows (letters, digits,
  dots, hyphens; anything else as `_<hex code point>_`), so two tags never
  share one. A tag's totals over all time are said once, on its year
  figure: today's month is always in the year to date. The average month is
  still not a figure.

## Consequences

- The seed has no tags: on it the context grows by the four year-to-date
  figures, 1,229 characters of 170,000. A tag costs about 350 characters for
  its month figure and 455 for its year one, so thirty tags all used this
  month are about 24,000: past the budget, old transactions give way to
  their monthly figures first (ADR 0030), as before. A target adds a line to
  every savings rate figure: about 650 characters on the seed.
- A tag's spelling is the user's; tags are stored lowercased and trimmed, so
  "Trip" and "trip " are one tag and one row.
- The selected movement can fall outside the newest 50 of a year: its panel
  still opens, its row is not listed.
