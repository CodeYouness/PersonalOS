# 0043. The rest is categorised after a review, and the model only proposes

- **Status** accepted
- **Date** 2026-11-17

## Context

Stage 2 of ADR 0037. The statements are imported (ADR 0041) and the
hand-kept ledger has given its categories to the movements it described
(ADR 0042). Hundreds of statement movements are still **open**: no
category, no counter account, counted. They count as Uncategorised spending
and income by their sign, and many of them are not spending at all: money
moved between the user's own accounts -- a current account and its savings
pocket at the same bank, a card topped up from the current account -- counted
once as spending on one account and once as income on the other.

What can file them, in order of how much it can be trusted:

- **the statements themselves**: two opposite amounts on two of the user's
  accounts on the same day are a transfer, unless the bank says otherwise;
- **what is already categorised**: the ledger filed months of movements, and
  a shop it filed under one category the same way every time is that
  category again;
- **the model**, for what neither covers.

Writing any of it straight into the data would put hundreds of guesses
among the user's own categories, indistinguishable from them. And a model
called during a dry run and again during the write can answer differently
the second time, so what was reviewed would not be what was written.

## Decision

**`npm run data:categorise` has two phases.**

- `--review <file.csv> [--model] [--window <days>]` **proposes and writes
  nothing to the store.** It writes a review file -- a CSV that must not
  exist yet -- and prints a report.
- `--apply <file.csv> [--write]` reads the reviewed file back and writes what
  it decides: a dry run by default, `--write` after a backup, and a second
  run changes nothing and takes no backup -- the conventions of every
  importer here.

So the model is asked at most once, in the first phase, and the second phase
needs nothing but the file and the data. **The model proposes and never
writes**: its answer is a proposal in a file the user reads and edits.

**Open** is: a statement movement (origin `statement`) with no
`categoryId`, no `counterAccountId` and `notCounted` false. Only open
movements are proposed for, and only open movements are filled.

**Proposals, in order; the first that proposes wins.**

1. **Transfers between your own accounts**, among open movements only: two
   movements on two different accounts of kind `cash`, in one currency, of
   exactly opposite signed amounts, dated within the window (2 days by
   default, at most 7). Matched one to one, nearest first: at distance 0,
   then 1, up to the window, every movement still unclaimed is offered the
   partners at that distance. A movement with exactly one partner, whose
   partner has exactly one too, is paired. **A movement with more than one
   equally good partner pairs with none, and neither do its partners**: they
   are listed as ambiguous and offered nothing further away. The result does
   not depend on the order of the data. The bank's movement type
   (`origin.detail`, ADR 0041) can only exclude or confirm: a card's own list
   (its rows carry a `merchant`), a fee row, and a type naming a card
   payment, a refund, a reversal, a fee, interest, a tax, a salary, a
   currency exchange or cash in or out never pair; a type naming a
   giroconto, a transfer or a top-up confirms a pair, which the review file
   says. A pair neither leg's type confirms -- a bank export typed only
   `Entrata`/`Uscita` -- is still proposed, and the review says the evidence
   is amounts and dates only. A false transfer hides real spending; a
   missed one leaves it visible as Uncategorised, where the user sees it --
   so a doubt pairs nothing.
2. **Rules learned from what is categorised.** Every statement movement with
   a category says "this merchant key is that category". A key whose
   categorised movements all agree proposes their category for the key's
   open movements, in either direction (a refund files under what was
   bought), and "not counted" with it when every one of them is not counted
   (a payment to a broker, ADR 0042). A key that disagrees proposes nothing
   and is listed with its categories and counts; an archived category
   proposes nothing either.
3. **The model**, only with `--model` and a key set, for the groups no rule
   covers and no disagreement concerns -- a key the user filed two ways is
   theirs to decide, not the model's.

**The merchant key** is the statement's merchant (a card's), else its
counterparty (a bank's), else the description, normalised: lower case,
accents dropped; a payment processor's prefix (a short name and a star or
underscore: `PAYPAL *`, `SumUp *`, `Zettle_`); every word holding a digit, so
references, dates, times, amounts and a card's last four go wherever they
sit; a bank's card-payment words from the front (`pagamento pos`, `pos`);
reference words and month names from the end. A **group** is the open
movements of one key and one direction.

**What the model is sent**, through the provider seam (ADR 0037) on its own
call type, `categorise` (`ANTHROPIC_MODEL_CATEGORISE`, Haiku 5.5 by default,
ADR 0030): per group, a reference, the key, one description **with every
digit masked**, the direction and the bank's own category when it gives one;
and the categories, archived ones left out, as id, path and kind. **No
amount, no date, no account, no note, no id of a movement.** Keys go 40 to a
call (`limits.categoriseBatchKeys`). The answer per key is a category id
from the list sent, or none; an id not sent, a reference not sent or a
second answer for one key is dropped and counted. A call that throws or is
cut off at its token ceiling leaves its keys without a proposal and is
reported: the script never fails because of the model. Without `--model`,
or with no key, the rest is simply unproposed.

**An answer against the direction of the money is shown, not proposed.**
Money in under a spending category counts as a refund, and money out under
an income one as a chargeback (ADR 0023), so a wrong guess lowers spending
and income together. The first run on real data filed pay received from a
restaurant under eating out. Such an answer is written in the row's `why`
and the decision is left empty: the user types the category to accept it. A
rule learned from the user's own categorised movements is not held back: a
refund they filed is theirs.

**The review file** has one row per proposed transfer pair and per group:
`row`, `key`, `direction`, `sample`, `count`, `total`, `from`, `to`,
`accounts`, `bank_category`, `proposed`, `source` (`transfer`, `rule`,
`model` or empty), `why`, `decision` and `ids`. Only `row`, `key`,
`direction`, `decision` and `ids` are read back. The decision is prefilled
with the proposal, and is one of: a category path, `Parent > Child` or
`Parent`, compared without regard to case or spacing; the same followed by
` (not counted)`; `not counted` alone; or empty, to skip the row. A transfer
row takes `transfer` or empty, to reject it. A path that does not exist,
names two categories or is archived, `transfer` on a group row, a header that
is not the review's, or a group listed twice blocks the write, each with its
line; nothing is written.

**Applying resolves each row against the data now.** An accepted transfer
row: both its movements, if both are still open, become not counted with no
counter account -- the representation ADR 0042 uses for a transfer whose two
ends are statement rows, so each balance moves once, by its own row. If
either was categorised since, both are left alone and the row is listed. A
group row: every movement it lists that is still open, and **every open
movement of its key and direction now**, including those imported after the
file was made (the report counts them), receives the category and, when the
decision says so, the not-counted flag. A movement categorised, made a
transfer or not counted since is left alone and counted. Transfer rows are
resolved first, so a rejected pair's movements fall to their key's group
like any other.

**Both phases print spending and income** on every account over the days
the movements cover, before and after -- after every proposal is kept, or
after the reviewed decisions -- from `totalsBetween`, the screens' own
derivation, never adjusted. That is where a transfer taken out of the
totals shows.

## Consequences

- A second `--apply` of the same file finds nothing open that the file
  covers, except movements imported since -- which it fills, and says so.
  An unchanged file applied twice in a row changes nothing the second time.
- The review file holds merchants and amounts: it is the user's, kept out of
  the repository like a statement.
- Changing the key's normalisation regroups movements. A review file made
  before still applies by the ids it lists; only new movements depend on the
  key.
- **Not built:** a decision that turns a movement into a transfer with a
  counter account -- a card topped up from the bank whose own statement does
  not list the top-up (ADR 0042's "one statement row" case). Such a row can
  be decided `not counted`, which keeps it out of the totals; the card's
  balance then does not receive it.
- Do not let the model write, or call it again in `--apply`: what is written
  must be what was reviewed.
- Do not pair a movement with an ambiguous partner "because it is the
  likeliest": a false transfer hides spending.
