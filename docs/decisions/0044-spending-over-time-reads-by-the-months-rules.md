# 0044. Spending over time is read by the month's rules, and a year is compared like for like

- **Status** accepted
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
- **No chart library.** Inline CSS marks in the existing tones: the series
  tones for parts of a whole and for the two flows, the ink for what was
  left, and no state colour -- spending above its average is not an error.

## Consequences

- The question context still answers per month and per twelve months; it
  has no year-to-date figure and no average. Adding them means calling
  `calendarYearFlows` and `spendingAverages` with the screen's arguments.
- A year's transaction list, with no line selected, is the whole year's.
- The window and the threshold are constants, `AVERAGE_MONTHS` and
  `AVERAGE_MIN_MONTHS` in `lib/domain/derive/finance.js`; the trend's length
  is `TREND_MONTHS`.
