# 0020. Health averages only finished, recorded days, and a weight is filed from capture

- **Status** accepted
- **Date** 2026-10-04

## Context

The Health card answers "how is the month going" with averages over the last
30 days. The averages already divided by recorded days only -- a day with no
meals is a day you did not record -- but two holes were left in that rule.

A day whose meals all had unknown numbers counted as recorded and added 0
kcal. Since ADR 0019 a meal said with no model has no numbers, so every
such day pulled the average down: the same lie the "recorded days only" rule
exists to prevent, one level further in.

Today counted too. At nine in the morning today holds a breakfast, so the
30-day average dipped every morning and recovered every evening -- a number
that moves with the clock, not with what you ate.

Separately, a capture classified as `health` filed capture + memory only.
`Measurement` existed in the types and the seed, with a free-string `metric`
no closed vocabulary allowed, and nothing ever wrote one. The card needs a
weight, and capture is the only way anything enters the system.

## Decision

**The averages cover the days before today, and count a day per number.**
A day contributes to the calorie average only when it has a meal with
calories, and likewise for each macro. Today is shown on the card, labelled,
and never averaged. The derivations return how many days each number
counted, so the reliability travels with the figure.

**A `health` capture that names a weight files a `Measurement`.** The model
reads the weight and the day it was taken; underneath, a rule reads a number
followed by "kg" onto today, so capture never fails. Only 20 to 300 kg is
believed; anything else files nothing and keeps the sentence. Moved to an
earlier day with no time said, a weight has `recordedAt: null` -- no time is
invented, as for a meal.

`metric` becomes a closed vocabulary, `measurementMetrics`, holding only
`weight`. A measurement is now a record a capture produces, so it gains
`createdAt` and `updatedAt` (backfilled by the v6 -> v7 migration), and
`health` joins the destinations Undo can act on when it filed a weight --
amending the list in ADR 0013 again, as ADR 0019 did for `nutrition`.

## Consequences

- Early in the month, or after a week without the model, the averages may
  rest on few days. They say so instead of padding with zeros.
- Today's row and the Nutrition card are the only places today's totals
  appear; nobody should "fix" the averages by adding today back.
- Weight is not editable on the card. A wrong one is undone and said again;
  if that turns out to be friction, editing is a ticket, not a workaround.
- The weight change is shown neutral. Colouring it needs a goal, which is a
  Goals decision, not a Health one.
