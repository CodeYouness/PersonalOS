# 0060. Income & spending says what its parts are: fixed costs, the view beside its name, a part of the bar opens its line

- **Status** accepted
- **Date** 2026-11-19
- **Amends** [0050](0050-income-and-spending-reads-as-a-circle.md) and
  [0053](0053-columns-beside-the-breakdown-and-one-tooltip.md) (the
  summary's Fixed and Variable rows, the card's toolbar, the composition
  bar's parts); applies [0059](0059-finances-shows-only-what-says-something.md)

## Context

Three things on the Income & spending card did not say what they were.

- **Fixed and Variable.** Under the savings rates the summary ended with two
  quiet rows, "Fixed € 227.94" and "Variable € 523.47". Their owner could
  not read them: nothing said they were the two parts of the period's
  spending, nor which categories made a cost fixed. They are spending in
  the categories whose Fixed box is ticked (`fixed`, each movement's own
  category, ADR 0044) and the rest of what was spent (`variable`).
- **The view.** Circle / Columns, words with their glyphs, sat at the far
  right of one toolbar after the period, so how the card is drawn read as
  one more thing about which period it reads.
- **The composition bar.** Each part of the strip above the spending table
  showed its category's figures, and then did nothing: to see what was in a
  part the eye had to find its row in the table and open it there.

## Decision

**Fixed and Variable become one line** under the summary's list, a caption
that wraps between its figures on a phone:

> Of the € 751.41 spent: fixed costs € 227.94 · the rest € 523.47

The same in a month and in a year; amounts in cents, as the summary's money
is, so the parts add up to the whole they name. **"fixed costs" shows what
it is made of**, in the one tooltip (Tip, ADR 0053) on hover, focus and a
tap: "Fixed costs, March 2026", then each category marked as a fixed cost
that spent in the period with its amount, largest first -- they add up to
the figure -- and a last quiet line, "A category counts here when Fixed is
ticked on it, under Manage › Categories." The word has a dotted underline:
it explains, it leads nowhere. The list is derived (`fixedCosts` of
`periodFlows`, from the same totals `fixed` is added up in, so a paired
refund, a movement not counted, a transfer and a spread movement count as
they do there); `fixedCostSplit` decides whether the line is said. **It is
not said** when nothing, or less than nothing, was spent, or when none of
the spending is a fixed cost -- nothing marked, nothing spent on what is,
or its refunds outweighing it: "fixed costs € 0.00" says nothing (ADR
0059).

**How the card is drawn sits beside its name; what it reads, on the
right.** Circle / Columns moves right beside "Income & spending" and is its
glyphs alone -- a ring, three bars -- each segment a 44px square named
"Circle" or "Columns" by its `aria-label` and `title`, marked
`aria-current` when chosen, with the same addresses (`?view=columns`; the
circle never written). `Segmented` takes a segment's `name` for this, so
any segmented control can be glyphs alone. Month / Year and the stepper
stay on the right. On a phone the name and the glyphs keep the first line
and the period wraps under them, still on the right.

**A part of the composition bar opens its line**, as the line's name in the
spending table does -- its subcategories, or its movements -- in the same
open state, held above the table (`useOpenLines`): a part of an open line
closes it, and the row's ▸ and the part's `aria-expanded` always agree. A
click, a tap, Enter or Space does it. Opened, the row is scrolled into view
only when it is outside it (`block: 'nearest'`). The part is a button
(`Tip`'s `onPress`) that still shows its figures on hover and focus; on a
touch screen the tap that opens the line also shows them, and a second tap
closes the line and hides them -- if the opened row had to be scrolled to,
the scroll hides the figures, and the row says the same three (name,
share, amount). Every part is one line: the bar folds no small categories
into a remainder, so no part can open a wrong line. A part whose line
opens nothing -- no movements were handed and it has no subcategories, so
its row is a link -- is not a button.

## Consequences

- No figure changes; nothing is stored and the schema does not move.
  `PeriodFlows` gains `fixedCosts`.
- The question context keeps `figure:fixed:` and `figure:variable:` as they
  are: an answer may still say "variable", which the screen now calls the
  rest.
- A period whose fixed costs net below zero shows no split: it would be a
  negative part of a whole.
- The view's words are gone from sight: a reader who does not know the ring
  and the bars has the title on hover, and the chart itself changes under
  them.
- Which lines are open is no longer the table's own state: a new control
  that opens a line goes through `useOpenLines`, never a second set.
