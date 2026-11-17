# 0045. A target savings rate, met by the rate as it is printed

- **Status** accepted
- **Date** 2026-11-17

## Context

The spreadsheet the Finances screen replaces kept a target savings rate beside
the actual one. The Income & spending card shows three savings rates -- the
month's, the twelve months ending with it, and in the year reading the
calendar year to date's (ADR 0044) -- and nothing to read them against.

Two things need a rule. Where a personal setting lives, and how it is
checked, already has one: "tracked since" (ADR 0025) and the default account
(ADR 0026) are profile fields, validated at the store boundary, edited in the
Settings card through `PATCH /api/finance-settings`. And what "meets" means:
a rate is a ratio, printed as a whole percent (`percent`, half up). A rate of
19.6% is printed as 20%; compared with the raw ratio it would read "under
the 20% target" beside the number 20%.

## Decision

- **One setting, in the profile: `financeSavingsTarget`**, a whole percent
  from 1 to 99 (`limits.savingsTargetMin`/`Max`), or null for none. Not 0 --
  a target of saving nothing is no target -- and not 100. A ratio (0.2) is
  refused, not read as 0%. Validated in the profile's patch fields, where
  every caller meets it; the route only lists it as editable. Set in the
  Settings card, saved when you leave the field, with Clear target.
- **Schema 24** gives every profile `financeSavingsTarget: null`, keeping one
  already there. Nothing else changes: with no target every rate reads as
  before.
- **Met is the rate as printed, at or above the target**
  (`meetsSavingsTarget`): `wholePercent(rate) >= target`, where
  `wholePercent` is the one rounding `percent` prints with -- moved into
  `lib/domain/format.js` so the comparison and the number can never round
  apart. A rate shown as 20% meets a target of 20. No income: the rate is
  blank, and so is the comparison.
- **Shown under each rate on the card**, the month's, the twelve months' and
  the year's: "Meets the 20% target" or "Under the 20% target", with a quiet
  dot -- filled ink when met, an ink outline when not. Words first, never
  colour alone, and no state colour: under a target is not an error.
- **In the year reading, what would have had to be left** when the target is
  missed (`targetShortfall`): the target's share of the year's income so far,
  rounded up to the cent, and how much more than was left that is. Both are
  read from figures already on the card -- the income and what was left --
  so it is plain arithmetic on them, not a forecast: the year is not over,
  and nothing here guesses the income still to come. Only a shortfall is
  said; a met target needs no number.
- **The question context** says it too: the profile names the target when
  one is set, and each savings rate figure (the month's, the 12 months', the
  year to date's) says whether it meets it, the year's with the shortfall.

## Consequences

- A rate and its verdict always agree on the screen, at the cost of a target
  "met" by 19.5%. That is the honest reading of what is printed.
- The month reading has no shortfall: a month is too short for "what would
  have had to be left" to be a plan, and the twelve months' rate already
  reads the longer run.
- One target for every period. A different target for a month and a year is
  not offered; nothing asked for it.
