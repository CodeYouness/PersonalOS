# 0026. A finance capture files a transaction when it names an amount

- **Status** accepted
- **Date** 2026-10-10

## Context

`docs/domain.md` left open whether a capture filed as `finance` should create
a Transaction. It became a note and a memory entry, and never touched the
money. With transactions recorded and read back (#132), "spent 18,40 at the
supermarket" said in the capture bar should not need the movement form as
well.

What could go wrong is the same as for a health sentence (ADR 0020): a
number nobody said, an account that does not exist, a category the model
made up. A fabricated transaction is worse than none.

## Decision

**A `finance` capture with an amount files a transaction**, linked to its
capture the way meals and weights are (`about`), so Undo and Refile work as
ADR 0013 describes.

- **Amount:** read by the model; with no model, the rules read an amount next
  to a euro sign or the word -- `€ 18,40`, `18,40€`, `18.40 €`, `18,40 euro`.
  An amount out of bounds is dropped, never believed.
- **Direction:** spending, unless the model reads income or a refund. The
  rules never guess a direction: they read spending.
- **Account:** the one the sentence names, when it matches one of yours that
  is open and valued by balance -- never creating one, the same posture as
  people (ADR 0018) -- otherwise the **default account**
  (`profile.defaultAccountId`), set on the Finances screen.
- **Category:** the model chooses among your open categories, which it is
  given; one it invents is dropped, and the transaction lands on the
  Uncategorised line.
- **Description:** the model's short label, or the sentence.
- **Date:** the day it moved when the model places it up to a week back,
  otherwise the day it was said.

**Nothing is filed** when there is no amount, or no account and no default:
the capture stays a capture and a memory entry, as before. Capture never
fails. **A transfer is never filed from a capture.**

The default account must be open and valued by balance. Archiving, deleting
or revaluing that account clears it, so a capture never lands on an account
that cannot move.

The classifier's `finance` keyword rule stays as it was.

## Consequences

- Spending said in one sentence is in the month's figures and the account's
  value at once.
- A capture filed on the wrong account or category is corrected on the
  transaction's panel, or undone from the capture log while untouched; the
  sentence is always kept.
- "spent 20 on coffee" with no currency stays a capture when there is no
  model: the rule reads only amounts it can be sure are money.
