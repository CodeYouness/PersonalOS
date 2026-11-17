# 0041. A statement movement is found by its account and its content, and each product is its own account

- **Status** accepted
- **Date** 2026-11-17

## Context

Stage 2 of ADR 0037: for an account that has statements, the statements are
its transactions. A statement is re-exported, and the exports overlap: last
month's file and this month's share weeks. The import has to recognise a
movement it already wrote, or the month doubles -- and the id it recognises
it by is stored on every imported transaction, so changing the rule later
means re-keying them all or importing everything twice.

Most of the files have no id for a movement. Two identical coffees on one day
are two movements with nothing but their position to tell them apart, and
position changes between exports. One bank's export also mixes several
products -- a current account, savings, a deposit -- each with its own running
balance.

`upsertTransactionByOrigin` already matches on `(source, externalId)` and
writes only the source's zone (ADR 0023). What was missing is the id, and a
place for what the bank says about a movement -- its category, the merchant
-- that the next step, categorising, needs.

## Decision

**The externalId of a statement movement** (origin source `statement`) is:

- `<account id>:id:<bank id>` when the file gives the bank's id;
- otherwise `<account id>:<hash>`, the first 24 hex characters of the SHA-256
  of the timestamp the bank gives (or the day, when it gives only a day), the
  signed amount in minor units before any fee, the bank's raw text for the
  row (each format names its columns, never a cleaned-up name that can
  change between exports) and an **occurrence index**: the count of
  otherwise identical rows of the account before it in the file;
- for a fee charged on a row, imported as a movement of its own:
  `<that movement's id>:fee`.

The account is the prefix, by id, so renaming an account changes nothing.
Identical rows cannot be told apart, so numbering them in file order gives
the same set of ids in any order: two coffees stay two.

**Each product in a file is its own account**, named on the command line; a
product with no account is refused, and two products into one account are
refused. A running balance belongs to one product, and a balance check is
only meaningful against one account.

**The bank's detail lives on the origin**, `origin.detail`: flat text under
short keys, checked at the store. The origin is already the source's zone, so
a re-import rewrites the detail with the rest of it and never touches the
user's zone. No schema change: a record without it has none.

**The importer creates an account with no origin.** An account with an
origin is synced and its balances are read-only (ADR 0031); a statement with
no running balance needs the user to type one.

## Consequences

- Re-importing the same file, a re-ordered one or a later, overlapping export
  writes only what is new or changed in the source's zone.
- A bank that rewrites a past row's text or amount makes a new movement
  beside the old one. The report counts the imported movements its date
  range no longer contains, so it shows; nothing is removed automatically.
- Moving a statement's movements to another account is a re-import under the
  new account, not an edit: the account is part of the id.
- A future format with a bank id gets the bank-id rule for free; one without
  hashes its own raw columns. Do not "simplify" the hash to the cleaned
  description, or a better normaliser duplicates a year of movements.
