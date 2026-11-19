# 0052. A movement counts in the months it is for

- **Status** accepted; amended by
  [0059](0059-finances-shows-only-what-says-something.md): nothing sets
  `countedOver` any more -- the panel's "Counts for" is gone, a movement
  already spread says so in one read-only line; the field, its validation,
  the route and the derivations stay
- **Date** 2026-11-17
- **Amends** [0023](0023-transactions-are-signed.md) (the user's zone gains a field),
  [0044](0044-spending-over-time-reads-by-the-months-rules.md) and
  [0050](0050-income-and-spending-reads-as-a-circle.md) (what a month counts)

## Context

The owner's salary for several months arrived at once, in November. Every
flow reading put a movement in the month of its date, so November earned
three salaries and September, which paid its rent and its shopping, read as
a month that spent more than it earned -- which is not what happened. The
same holds for a year's insurance paid in January, or a bonus for a quarter.

The date is not wrong: it is the day the money moved, and balances, net
worth and the statement import all follow the bank. What is missing is a
way to say which months a movement is *for*, read by the flows only.

## Decision

**A movement may say which months it is for**: `countedOver`, on the
transaction, `{ from: 'YYYY-MM', to: 'YYYY-MM' }` -- both months included,
`from` not after `to`, at most `limits.financeCountedOverMaxMonths` (24) of
them -- or null, the month of its date, as before. One month other than its
own is a range too. It is **the user's**, beside `categoryId` and
`notCounted` (ADR 0023): validated at the store boundary (`requireCountedOver`,
on the way in and in a correction, every caller meets it), set or cleared
through the transaction's PATCH route, and never read from an import, so a
statement re-import keeps it (`upsertTransactionByOrigin` reads only the
source's zone). It may sit on a transfer or a movement not counted, where it
changes nothing: they are in no flow, and turning one back keeps what was said.

**Schema 25** gives every transaction `countedOver: null`, keeping one
already there. Nothing else changes: every movement counts in the month of
its date, as it did. The seed is brought up by hand.

**The date never moves.** Account values (`accountValueOn`), net worth and
its history, the Transactions card's list by date and the statement import
read the date, as before.

**The amount is divided equally over the months, in whole cents**
(`splitEvenly`): each part is the amount over the number of months, rounded
down in size, and the cents left over go one each to the earliest months --
so the parts always add up exactly to the amount and never differ by more
than a cent. The sign is the amount's. 1,000.01 over three months is
333.34, 333.34, 333.33.

**One place decides it**: `countedFlow`, the one reading of a transaction
every flow adds up, now also gives its `parts` -- its value in each month it
counts in (`countedParts`) -- and `totalsOver`, which every reading by
months adds up through, takes only the parts in its months. So at once:
the month and the year (`monthFlows`, `calendarYearFlows`), the twelve
months ending with a month (`yearFlows`), the trend's bars (`flowTrend`), the
savings rates and the target's verdict and shortfall, fixed and variable,
the category lines and their averages, the circle (it reads the flows), the
By tag card's period figures (`tagFlows`; its all-time totals stay whole and
its first and last day stay the days the money moved), the count of
movements without a category, and every figure the question context cites,
since it reads these derivations. A month holding only a part of a movement
is a month with something counted. `flowMonths` offers the first month a
movement counts in when nothing says when tracking started. A refund spreads
like any counted movement, reducing the spending of each of its months.

**A reading by days stays by date**: `totalsBetween` counts a movement whole,
on the day it moved. It is what the week review and Home's "last week's
spending" sentence read, and what the import scripts' checks compare with
the bank's or the ledger's days. A part of a month is not a part of a week,
and spreading a movement over the days of its months would invent daily
spending nobody did. Home reads no month comparison of spending, so nothing
there changes.

**Where a spread movement is listed.**

- The Transactions card, with nothing selected, lists the period by date: a
  spread movement on its real day, in the month it was paid, with a quiet
  note, "· counted over Sept–Nov" (`countedOverNote`; the short month is the
  screen's, `monthShort`).
- With a line or a tag selected, the card lists what that selection's total
  counts (`listedTransactions`): a spread movement in every month it counts
  in, still on its real day, with the same note.
- In Income & spending's table view, a line's movements open in place
  (`lineMovements`, ADR 0050 as amended): a spread movement shows the
  month -- or months, in a year -- of the period it counts in instead of a
  day, its part of the amount, and "2 of 3 · paid 15 Nov".

**Setting it.** The movement's panel has a "Counts for" control: "The month
it was paid" (the default, saved as null) or "Spread over months", a From and
a To month picker. Choosing to spread shows the pickers at the paid month
and saves nothing until one changes; a From after the To moves the To with
it, and the reverse, so a range is never backwards. The store refuses a range
too long and the panel says why, as any refused write. The pickers offer the
months a range starting or ending in the paid month can reach, and a saved
month further away. Absent on a transfer and a movement not counted.

**The question context** says it on the transaction's item: "counted over:
September 2026 to November 2026 -- income and spending split its amount
equally over those months".

## Consequences

- A week and a month disagree about a spread movement, on purpose: the week
  is by day, the month by what the money was for.
- A part that falls in a month not on offer -- before "tracked since", or
  after today -- is in no month the card shows until that month is offered.
  A salary for November to January paid in November reads one third in
  November until December arrives. The year to date is the months on offer,
  as before.
- A line's listing for September can hold a movement dated in November; the
  note says why it is there.
- The remainder of a split goes to the earliest months: a cent at most each.
- Nothing is stored that can be derived: the parts are computed on every
  read from the range and the amount, so correcting either corrects them.
