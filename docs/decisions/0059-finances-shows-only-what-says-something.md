# 0059. Finances shows only what says something

- **Status** accepted
- **Date** 2026-11-19
- **Amends** [0046](0046-spending-by-tag.md) (when the By tag card is
  there), [0045](0045-a-target-savings-rate.md) (what a savings rate shows
  where a percent says nothing), [0050](0050-income-and-spending-reads-as-a-circle.md)
  and [0057](0057-the-breakdown-lists-what-the-period-holds.md) (the
  breakdown's Share), [0052](0052-a-movement-counts-in-the-months-it-is-for.md)
  (nothing sets `countedOver` any more)

## Context

The Finances screen printed things that say nothing, and the eye has to
read them before it can skip them.

- **The By tag card** stood in every period of a user with any tag, and in
  most periods it was a whole card for one sentence: "No tagged movement
  counted in March 2026."
- **A savings rate** is a share of what came in. With no income it was
  already blank ("—"), but a month that earned 100.00 and spent 350.00 read
  "−250%": a number that looks like a measure and measures nothing a reader
  can use. The money -- 250.00 overspent -- says it.
- **The breakdown's Share** printed "−50%" for a line that was a net refund,
  and "100%" for every line of a period whose refunds outweighed its
  spending: a share of a whole that is not positive is no share of anything.
- **"Counts for"** (ADR 0052), the control in a movement's panel that
  spreads it over months, is one the owner decided not to use. A control
  never used is a question asked on every movement opened.

## Decision

**The By tag card is there only when it has something to say**: when the
period holds a tagged counted movement (`tagFlows` gives a row), or when a
tag is selected (`?tag=`), so the card stays -- saying the period holds none
-- beside the Transactions card that lists and clears the selection. Never
when no movement has a tag. Nothing links or scrolls to it
(`#card-finance-tags` is its id, not a target), and the Transactions card
under it in the same column simply moves up.

**A savings rate that says nothing becomes the money**, by one rule
(`savingsReading`, beside `savingsRate` in `lib/domain/derive/finance.js`),
which the card and the question context both ask:

- **The rate** when there was income and, as printed (`wholePercent`), it is
  −100% or above: spending exactly twice the income is still "−100%".
- **What was saved** -- income less spending, signed, in the summary's money
  ("−€ 250.00") -- with no income (zero or less), or a rate below −100%.
- **"—"** when nothing came in and nothing went out.

The target's verdict stays true to what is shown: a rate's as printed
(`meetsSavingsTarget`, unchanged); money below zero is "Under the 50%
target" -- losing money meets no target of 1% or more -- which a month of
spending and no income now says where it said nothing before; money saved
with no income has no verdict, as it is no share of anything. The year's
shortfall (`targetShortfall`) is unchanged: with income and a rate below
−100% it still says what would have had to be left. The rule applies to
"Saved this month", "Saved over 12 months" and "Saved in <year>". Home
prints no savings rate. The question context's savings figures keep their
ids and, where the card shows money, say "Saved in January 2026: -250.00
EUR" and why it is not a rate; with nothing in or out there is no figure,
as before.

**A share that says nothing is "—"**: a line's share (`lineShare`, the
`share` of every `CategoryFlow`) is null for a line whose total is below
zero -- a net refund or chargeback -- and for every line when the period's
spending or income is not positive. A line at nothing beside a positive
whole keeps its "0%". The lines beside a net refund keep their share of the
whole as computed before -- what they spent over what the period spent --
so together they add up to more than 100%, and one can pass 100% alone
(spent 1,000.00 beside a refund of 300.00: 1,000 of 700, 143%). That is
kept on purpose: it is still each line's size against the period's figure
the summary prints, and a share of the positive lines only would set the
column against a total printed nowhere. The question context drops "Its
share" where the card shows "—". The composition bar was already the
positive lines' own parts and does not change.

**Nothing sets `countedOver` any more.** The movement's panel loses "Counts
for" -- its two choices, its month pickers and the client code behind them.
The stored field, its validation, the PATCH route's acceptance of it, the
schema, the import's keeping of it and every derivation that honours it
(ADR 0052) stay: removing them needs a schema migration, and a movement
already spread must keep being read as it was. Such a movement still says
so: one quiet line in its panel, read-only -- "Income and spending count it
over 3 months, Sept–Nov, in equal parts; the balance keeps the day it was
paid." -- and the lists keep their "· counted over Sept–Nov" note, so the
screen never hides why a figure is what it is. A transfer or a movement not
counted, in no flow, shows no such line.

## Consequences

- No total, balance or chart changes; nothing is stored and the schema does
  not move. What changes is what is printed beside the figures.
- A month with spending and no income now says "Under the target" where it
  said nothing: the verdict follows the money shown.
- `CategoryFlow.share` can be null; every reader handles it.
- A movement can only be spread over months by a script or the route now.
  If the owner wants it back, the control comes back from git history and
  this ADR is amended; if never, a later ADR retires the field with a
  migration.
