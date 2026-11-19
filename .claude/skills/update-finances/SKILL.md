---
name: update-finances
description: Bring Finances up to date from the exports the user hands over (a card's or a bank's movements as JSON or CSV) -- convert, import, categorise, report. Use when the user gives new movements, a balance, or asks to update Finances.
---

# Update Finances

The user hands over exports; you convert, import, categorise and report. The
app is where they read the result and type cash movements. Investments are
not handed over: the broker is synced (`npm run sync:scalable`).

This repository is public. The user's accounts, categories, merchants and
the command each account takes are in **`data/finance/agent-notes.md`**
(git-ignored). Read it first, and update it when something changes. Nothing
personal goes in this file, a commit, a PR or a test.

## Where things run

- Scripts that read or write the real data run from the **main checkout**
  (the folder the `personalos.serve` service runs from), on `main`.
- A dry run is done on a **copy**: copy `data/personalos.json` and
  `data/seed.json` to a scratch folder, run with `DATA_DIR=<copy>` and
  `USER_TIMEZONE` as in the notes, delete the copy afterwards.
- Before any `--write`: `launchctl bootout gui/$(id -u)/personalos.serve`.
  After: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/personalos.serve.plist`,
  then check `/finances` answers. Data scripts do not take the writer lock.
- Every `--write` backs up first and a rerun must report nothing to change.
  Run the rerun; it is the proof.
- A balance, or a single correction, goes through the app's routes on
  `127.0.0.1:3000` (`POST /api/accounts/<id>/observations`,
  `PATCH /api/transactions/<id>`), never by editing the data file.

## Steps

When the user asks for months instead of handing files over, run
`fetch-statements` first: it saves and converts them, and ends where step 2
begins.

1. **Keep the original.** Copy what the user gave into `data/finance/`
   unchanged.
2. **Find where the data stops.** For the account, read the last movements
   in the data and compare them with the export's: the overlap must agree.
   Say so if it does not, before importing anything.
3. **Convert** to the statement shape the account's format reads
   (`scripts/statement-import/formats/`; the header and the vocabulary of
   each are in the file's comment). Save the converted CSV in
   `data/finance/` beside the original.

   **A Bybit card's JSON is converted by the script**, not by hand:
   `npm run data:convert-bybit -- <file.json> --known <earlier.csv> ...`
   (every earlier converted CSV of the card, so a movement already imported
   keeps its merchant), then again with `--out <new.csv>`. It applies the
   rules below and lists what it left out, any problem (it then writes
   nothing), the rows whose identity is the name as given -- note those in
   `agent-notes.md` -- and the available balance to record in step 6.

   Rules that hold for every source:
   - one row per movement that moved money; an authorisation that was
     reversed, or a doubled authorisation the source says was annulled, is
     not a movement;
   - **a pending row with a booked amount** (a fuel pump's pre-authorisation
     is the usual case: the row shows the hold, the source's dashboard the
     real amount) is imported at the booked amount. A pending row with no
     booked amount is left out and listed to the user;
   - keep the merchant **as the source sends it**: a movement's identity
     hashes it, so a cleaned-up name makes a duplicate the next time the
     raw name arrives. When only a clean name is given, use it and note the
     row in `agent-notes.md` as "identity from a clean name";
   - never guess a sign or an amount. A row you cannot read is listed, not
     imported.
4. **Import.** `npm run data:import-statement -- <file> --format <f>
   --account "<name>"`, dry run on a copy, then `--write`, then the rerun.
   A partial file warns that earlier movements "are not in this file":
   expected, nothing is removed.
5. **Categorise.** `npm run data:categorise -- --review <new file.csv>
   --model`, run from the main checkout so the key is found; it writes only
   the review file. The user has agreed that descriptions go to the model
   (digits masked, no amounts, dates or accounts).
   - Rules learned from the user's categorised movements come first: that
     is what keeps new spending consistent with old.
   - Read the review file yourself before showing it. Fix what the notes'
     conventions settle (a payment to the broker, a top-up of the user's
     own card, a transfer in the user's own name). Leave the decision empty
     where you are not sure.
   - Show the user **only the rows that need them**: no proposal, a
     proposal against the direction of the money, a key whose past
     categories disagree, anything large. Not the whole file.
   - On their answer, `--apply <file>` dry run, `--write`, rerun.
6. **Balance.** When the user gives one, record it and compare it with what
   the account was worth just before: a difference is movements still
   missing. An account with no balance is unknown and stays out of net worth.
7. **Report**, short: what was imported per account, what was categorised
   and how (rule, model, by hand), what is still open and why, the month's
   spending and income after, and anything left out of the import.
8. **Write down what you learned** in `data/finance/agent-notes.md`: a new
   merchant convention, a quirk of a source, a row to watch.

## What not to do

- Do not import a ledger row or a hand-typed movement for an account that
  has statements: the statement is the source there, and the month would be
  counted twice.
- Do not overwrite a category, note, tag or flag the user set. The scripts
  fill only what is empty; do the same by hand.
- Never delete a refund or the purchase it refunds: the user pairs them in
  the movement's panel ("Refund of…", ADR 0055), which hides the pair from
  the list and keeps the balance and a re-import right.
- Do not call the model on page load or outside `--review --model`.
