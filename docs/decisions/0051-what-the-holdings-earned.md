# 0051. What the holdings earned

- **Status** accepted
- **Date** 2026-11-17

## Context

The spreadsheet Finances replaces showed, for each investment and in total,
its cost basis, market value, today's profit or loss, the gross profit or
loss, the profit or loss net of tax -- each as an amount and a percentage --
and the year to date. Finances showed only each holding's value. The owner
had just had the accounts table cleared of its Type, 30-day and As-of columns
(ADR 0049), so the new numbers could not come back as columns.

The data is a holding's trades (units, price per unit, fee) and its prices.
A synced holding's prices are not daily: the broker sync writes one on each
day it is run, by hand, and one per month-end from the chart (ADR 0031). A
hand-made holding has a price on each trade and whatever was typed.

## Decision

**One derivation, `investmentReturns(inputs, today)`** in
`lib/domain/derive/investments.js`, for every holding and all of them. The
Net worth card, a holding's panel and the question context read it; nothing
is stored and no schema changes.

**Cost: weighted average cost, fees in.** A buy adds its units and its
units times price plus fee; a sell takes its units out at the average cost
of the units held (rounded half up to the cent, in BigInt) and realises its
units times price less fee minus that cost (`averageCost`). It is what
Italian brokers report as "prezzo medio di carico", and nothing in the data
points elsewhere: Scalable reports no lots, and a merger or a transfer is
already a sell and a buy at the broker's value (ADR 0031), which average
cost reads as it reads any other. FIFO would need lots the brokers do not
give. A day is read whole, buys before sells, as the store judges "never
below zero units"; trades that sell what was never bought leave the cost
unknown rather than guessed.

**Value is `accountValueOn`**, never valued again, so a holding's value in
the Investments fold is its value in the accounts table. **Profit or loss**
is value minus cost basis; its share is over the cost basis. Unknown with no
trade: the totals leave it out and name it.

**Realised is apart.** The profit or loss is on the units still held; what
the sells made is said beside it, "not in the P/L above". A holding archived
-- sold completely -- counts only there.

**"Today" is the last price day, by its date.** The change is the units held
today at today's price against the price in use on `since`: the last day
before the newest on which any open holding has a price. One day for all
holdings, so the rows add up to the total; the same units on both sides, so
a trade is never a change. With prices on sync days and month-ends, "today"
would be a lie whenever the sync was not run yesterday: the screen says
"since 14 Nov". A holding first bought after that day is left out and
counted.

**The year to date** is the value now, less the value at the end of
31 December -- nothing for a holding first bought this year, whose year
starts at its first trade -- less the money put in since, each trade's money
counted by `tradeCash`, the rule `periodInvested` (the circle's invested,
ADR 0050) adds up. Its percentage is over the **money at work**: the start
value plus each sum put in, less each taken out, weighted by the share of
the period it was in -- the modified Dietz return. A plain "gain over money
put in" overstates a year in which money arrived late; a time-weighted return
needs a value on every flow date, which month-end prices cannot give. A
holding archived by hand with units still held has no year to date: it left
net worth with its units.

**After tax: 26%, on each gain on its own.** `limits.financeCapitalGainsTaxPercent`
is 26, Italy's rate on capital gains; a loss is not reduced. The total after
tax adds each holding's, so a loss on one does not lower the tax on another's
gain: in Italy an ETF's gain is income that losses cannot offset, while a
share's can be, and the app cannot tell which a holding is. Conservative,
and said on the screen ("each gain taxed on its own"). Government bonds are
taxed at 12.5% (`limits.financeGovernmentBondTaxPercent`, claimed, not read):
a holding cannot say it is one, so every holding takes 26% and the figure is
labelled "after 26% tax". A per-holding rate would need a field on the
account -- an instrument type or a tax rate, owned by the user even on a
synced account (as its name is), validated against the closed list in
`personalos.config.js` -- and a schema migration; and for a fund holding
some bonds, the share of them. Not in this decision.

**Where it shows.** The accounts table keeps Account and Value:

- under the Invested section's head, one line: cost, P/L with its share, and
  the change since the last price day -- signed, in the up or down tone, the
  sign always printed; "Holdings cost" when an investment valued by balance
  is in the section, whose subtotal it is then not part of;
- after a holding's name, its P/L share, a 13 px caption, toned;
- an **Investments** fold under the accounts table, one line until opened
  (the "N more accounts" pattern): every open holding with cost, value, P/L
  and %, the totals, then after tax, realised, since the last price day, the
  year to date, and what was left out. A fold in the Net worth card rather
  than a card of its own: the holdings are already there, it costs one line
  closed, and a new card would be a second place for the same accounts. Its
  table scrolls inside its box under 520 px;
- a holding's panel starts with all of it for that holding, to the cent:
  units, cost with the average a unit, value, P/L, after tax, realised,
  since the last price day, the year to date.

The question context gains `figure:investments:now` and
`figure:investments:<YYYY>-ytd`, about 1,000 characters on the seed.

## Consequences

- `holdingPriceOn` (the price in use on a day) and `tradeCash` (a trade's
  money) moved out of `holdingValueOn` and `periodInvested` so the new
  numbers price and count with the same rules; neither changed.
- `formatReturn` writes a share to a tenth of a percent, "+16.3%": a whole
  percent hides most of a year's movement.
- Dividends, coupons and the broker's cash interest are not trades and are in
  none of these figures; the year to date of a distributing fund is
  understated by them.
- A merger's sell and buy at a cost rather than a market value (ADR 0031)
  realise a gain or loss that is not one, until the next price.
