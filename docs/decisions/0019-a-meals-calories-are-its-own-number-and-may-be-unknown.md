# 0019. A meal's calories are its own number, and a meal can be filed without numbers

- **Status** accepted
- **Date** 2026-09-24

## Context

The Nutrition card is the first card whose record carries numbers the user
did not type: a meal is said in a sentence, and its calories and macros are
the model's estimate. Two things follow that no earlier card had to settle.

The glossary said calories **are** the macros, at 4/4/9 kcal per gram. If
that were true, rule 6 would say calories must be derived, never stored. It
is not quite true: alcohol carries about 7 kcal/g and is neither protein,
carbs nor fat, so a beer derived from its macros reads low -- every evening
with a drink in it would misreport. Even the seed's estimates do not match
the formula exactly.

And a capture must never fail (rule 2), but only the model can estimate a
meal. The rule-based classifier can tell "I ate" is `nutrition`; it cannot
say how many calories a carbonara has. Until now a `nutrition` capture filed
as capture + memory only, so nothing could go wrong. Once it files a meal,
something has to happen when there is no model.

## Decision

**Calories are a stored number of their own.** Changing a macro recomputes
calories with the formula; a model estimate may differ from the formula;
changing calories changes only calories. The formula stays in
`lib/domain/derive/nutrition.js` as the default, not as a constraint.

**A meal can be filed with its numbers unknown.** Said with no model, or
with a number the model returned out of range, a meal is still filed, by
name, and its calories and macros are `null`. Unknown is not zero: a day's
total and the averages sum only meals with numbers and report how many had
none. The same holds for `time` when a meal is moved to another day with no
time said.

A meal is now a record a capture produces, so it gets `createdAt` and
`updatedAt` like the others, and `nutrition` joins the destinations Undo can
act on -- amending the consequence in ADR 0013 that listed it among the ones
with nothing to retract. Existing meals are backfilled by the v5 -> v6
migration with `createdAt = updatedAt` set to when it runs.

## Consequences

- A beer, a cocktail or any estimate that disagrees with 4/4/9 is shown as
  estimated, not corrected into agreement.
- Every reader of a meal's numbers handles `null`. A total that silently
  treats unknown as zero is the bug this decision exists to prevent: it would
  make the day you skipped the model look like the day you ate least.
- A future reader must not "tidy" calories into a derived value because the
  formula exists, nor fill unknown numbers with zeros or guesses to make the
  types simpler.
