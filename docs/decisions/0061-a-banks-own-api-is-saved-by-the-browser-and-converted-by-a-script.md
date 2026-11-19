# 0061. A bank's own API is saved by the browser and converted by a script

- **Status** accepted
- **Date** 2026-11-19

## Context

Stage 2 of ADR 0037 imports statements, and for three sources there is no
export button: the Bybit card, Mediolanum and Crédit Agricole show their
movements in a web app that reads them from its own, undocumented API. The
first files (the `card-normalised`, `bank-normalised-typed` and
`bank-normalised-signed` CSVs, ADR 0041) were made by an agent in the user's
browser, writing the conversion as JavaScript in the page on the spot. That
worked once, but it cannot be repeated reliably: the conversion was never
the same code twice, it was not tested, and the stable id of a movement
without a bank id hashes the row's text (ADR 0041) -- a conversion that
trims or collapses the text differently on the next run imports every
movement a second time.

The user wants to ask for "September and October" and get them, then import
as usual. Two ways were weighed:

- **Open banking (PSD2)** through an aggregator with a free personal tier
  (Enable Banking): official, read-only, no browser, schedulable. It covers
  the banks but not the card -- a crypto card is not a payment account --
  needs an application, a key and a consent the user renews every 180 days,
  and is a new integration (ADR 0010) with its own sync state. Worth doing;
  not the first step.
- **The browser, as before, with the conversion moved into the repository.**
  Works today for all three sources, needs the user signed in (he types his
  own codes; the agent never does), and depends on endpoints the banks can
  change.

## Decision

**The browser only saves, the script converts.** The `fetch-statements`
skill opens each source's page in the user's signed-in browser, calls the
same endpoint the page calls -- with the page's own authentication, never
read out or stored -- pages through it, and saves the API's records
untouched in a **dump**: `{ source, fetchedAt, records }`. No rule runs in
the page.

**`npm run data:convert-dump`** turns a dump into the file the next step
already reads, keeping only the months asked for (`--from`, `--to`, local
days, both ends included):

| `source` | becomes | then |
| --- | --- | --- |
| `bybit-card-api` | the card JSON `data:convert-bybit` reads | the card's rules -- fuel holds, annulled authorisations, the merchant identity of earlier files -- stay in `bybit-json.js` |
| `mediolanum-api` | a `bank-normalised-typed` CSV | the bank's movement id is the stable id |
| `credit-agricole-api` | a `bank-normalised-signed` CSV | the stable id hashes `causale` trimmed and `descrizione` with its white space collapsed, exactly as the first files were written |

**No new format.** The output is a format the importer already has, so a
movement already imported from the first, hand-made files is recognised and
not written twice.

**Never guessed, as everywhere else**: an unknown type or state, an amount
that is not a plain positive decimal for the card, a missing date is a
problem and nothing is written. The card's declined payments
(`displayStatus` 2) moved no money and are left out and listed; a released
authorisation (`unfreeze`) goes to the card's rules as an annulled one. The
card's list does not carry what a fuel pump finally booked, so a pending
purchase there is skipped by the card's rules, as before, and listed for the
user.

Open banking stays the next step for the banks, as an integration; the dump
path stays for the card, and as the fallback for a bank the aggregator does
not reach.

## Consequences

- Asking for months is one skill run: save the dumps, convert, then the
  usual `update-finances` steps. Overlapping months write nothing twice.
- The endpoints are undocumented: when a bank changes one, the skill's
  recipe breaks loudly (no records, or a problem per record) and is updated;
  the converter and its tests do not move unless the records' fields do.
- The dumps are personal and stay in `data/finance/`, ignored by git, beside
  what they become.
- Do not "tidy" the text a conversion writes for a source without a bank id:
  ADR 0041's hash reads it, and a nicer description re-imports a year.
