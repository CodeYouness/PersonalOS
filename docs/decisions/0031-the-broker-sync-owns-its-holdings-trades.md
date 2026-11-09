# 0031. The broker sync owns its holdings' trades

- **Status** accepted
- **Date** 2026-11-09

## Context

The roadmap said the broker sync would write observations (ADR 0010). The
domain has since learned to value a holding from its trades and prices
(ADR 0022), and Scalable's transaction history adds up exactly to the units
it currently reports. Typing a monthly savings-plan purchase, or a month-end
price for a fund not bought in months, is what the sync exists to stop.

Scalable ships a CLI, `sc`, that prints JSON under a session logged in
read-only and kept in the macOS Keychain. A script can call it; an agent's
MCP session cannot be scripted (ADR 0010).

## Decision

**One holding per security, written from its trades.** The sync reads
`sc broker holdings`, `broker transactions` (paged on the cursor until it is
null) and, for single orders only, `broker transaction details`. It writes an
`investment` account valued by units per ISIN and that holding's trades,
through the store. Observations are not used for holdings.

**A synced account belongs to its source, except its name.**

- It is found by `origin { source: 'scalable', externalId: <ISIN> }` and never
  adopts a hand-made account, even one with the same name.
- Its kind, valuation and currency (EUR) are the source's; the name is the
  user's, set from the broker's once and never overwritten.
- Its trades and prices are read-only in PersonalOS: the store refuses to
  correct or delete them, and Finances marks them "from Scalable". Only the
  sync's own store functions write there.

**A holding's trades are written as one set.** `replaceSyncedTrades` takes the
whole set for a holding and a source, creates, changes and removes so the
holding mirrors it, and judges "no day below zero units" once, after all of
it. So a sell read before its buy is fine, a trade the broker cancelled or
stopped reporting is removed, a second identical run changes nothing (a
trade that did not change keeps its `syncedAt`), and another source's trades
on the same holding stay.

**Price and fee.** A single order's list `amount` already includes its fee:
for a buy, `|amount| = market valuation + transaction fee`. Taking the price
as `|amount| / units` and the fee from the details as well would count the fee
twice. So:

- a single order (its details are fetched anyway, for the fee) is priced at
  `trade_transaction_amounts.market_valuation / units` and carries
  `transaction_fee` as its fee;
- a savings plan, a swap or a transfer has no fee and is priced at
  `|amount| / units`;
- price is rounded half up to the cent and units are exact to 10^-8, so
  `units x price + fee` is the broker's amount to within a few cents.

(The spec said "price = |amount| / quantity"; this supersedes it for single
orders.)

**Failures write nothing.** The sync reads everything from `sc` before it
writes anything. Any non-zero exit (1, 10, 20 or 30), output that is not JSON
or an envelope with `ok: false` fails the run: it records a failed
`SyncState` (status and error only, so `lastRunAt` stays the last success and
Finances can say how old the data is) and leaves the data as it was. A
refusal because demo finance rows are present records nothing.

**What it leaves alone, out loud.** Only `SETTLED`/`FILLED` buys and sells in
EUR become trades. Cancelled orders (the broker reports them with amount 0),
pending ones and a security cancellation row with the order it cancels are
dropped. Crypto with units, and anything not in EUR, is skipped with a
warning; crypto with none is ignored. Rows no part of the sync maps yet --
mergers and transfers, cash movements -- are counted in a warning, not
written. A holding whose trades would leave it below zero units (a sell of
units that arrived by a transfer) is set aside with a warning rather than
failing the run.

**Mergers, transfers and archiving.** Mergers and transfers become sells and
buys at the value the broker reports, and that value can be a cost rather
than a market price, so the day of a merger can be off until the next
month-end price. A holding is archived at zero units, on the day of the trade
that emptied it (`setSyncedAccountArchivedOn`, not "today"), and restored if
units come back. The below-zero set-aside stays: with transfers mapped, a
holding still below zero means the broker's history is incomplete, which is
worth a warning, not a guess. The sync owns its holdings and
the spreadsheet import adapts to it.

**Prices (ticket #215).** A synced holding is priced by its broker. Each run
records today's quote (`sc broker quote`, `quote_mid_price`, dated today in
`USER_TIMEZONE`) and one price per month-end since the holding's first trade,
from `sc broker chart --timeframe max`: the last chart point on or before the
month-end, each point's timestamp read as a day in `USER_TIMEZONE`. A month-end
before the first trade, before the first chart point, or not yet come gets none.
A holding this run empties is priced to the day its trades empty it (not the
stored `archivedOn`, which is written later in the run) and takes no
quote. The writes go through `upsertSyncedPrice`, one per holding per day, so
a second run corrects; only prices that differ are written. A security whose
chart has no points is skipped with a warning and its trades still count; a
quote or chart command that fails fails the run, like every other `sc` read.
The reads happen in the plan stage, so a holding another part contributed is
priced too, still before anything is written.

**Running it.** `npm run sync:scalable`, `--dry-run` to print the plan and
write nothing. The first run that would create an account takes a backup of
the data file and prints where. The sync is a script on the Mac where `sc` is
logged in; no render ever calls it, and no credential enters the app.

## Consequences

- The sync core takes a command runner and the store; a test answers each
  command from an invented payload, and only the child-process wrapper is
  untested beyond a smoke test.
- The core is staged (fetch, contribute, plan, apply) and made of parts, so
  prices, cash, and mergers and transfers each add a module and a line in
  `PARTS`, not a rewrite.
- A recomputed cost can differ from the broker's amount by a few cents.
- A holding can sit un-synced, with a warning, until the part that maps the
  transfer it depends on exists.
- The DEGIRO import amends this ADR with the rule for units arriving from
  another broker.
