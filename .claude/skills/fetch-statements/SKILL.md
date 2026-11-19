---
name: fetch-statements
description: Fetch the movements of chosen months from the Bybit card, Mediolanum and Crédit Agricole web apps in the user's signed-in browser, save them as dumps and convert them for the import (ADR 0061). Use when the user asks for the movements of a month or months, or to pull movements from those sites; then continue with update-finances.
---

# Fetch statements

The user names the months; you fetch each source's movements from its own
web app, save them untouched, convert them with `npm run data:convert-dump`,
and hand over to `update-finances` at its step 2. Revolut is not here: it has
its own CSV export (`--format revolut`), which the user downloads from the app.

This repository is public. Account numbers, client ids and anything the
pages show stay out of this file, commits and PRs; the user's accounts and
the command each takes are in `data/finance/agent-notes.md`.

## Before you start

- **Months**: `--from YYYY-MM --to YYYY-MM`, both included. "This month" is
  the month of `today()` in `USER_TIMEZONE`. Ask only if the user named none.
- **Browser**: the user's own browser with their sign-ins (Claude in Chrome),
  in a tab you open. **The user signs in; you never type a code, a password
  or a one-time code.** A bank's session may belong to one tab (Mediolanum):
  open the login page in your tab and ask the user to sign in there.
- **Nothing secret leaves the page.** You capture the page's own request
  headers into a page variable and reuse them in the page. Never print a
  header, a token, a cookie or an account id into the conversation; a tool
  that refuses to return such data is right, do not work around it.
- **Saving**: the dump is downloaded by the page (a blob link) to the
  browser's download folder; downloading the user's own data is what they
  asked for. Then move it into `data/finance/` of the main checkout,
  unchanged.

## The recipe, for every source

1. Open the source's movements page and let it load.
2. Install a hook on `XMLHttpRequest` and `fetch` that keeps, for the list
   endpoint below, the URL, the request headers and the body in a page
   variable. Trigger the page's own list call (a filter, "Cerca", "Apply").
3. Call the same endpoint from the page with those headers, paging as below,
   and collect the API's records as they are.
4. Return to the conversation only counts and dates: how many records, the
   first and last day, the months covered.
5. Download `{ "source": "<source>", "fetchedAt": "<ISO now>", "records": [...] }`
   as `<source>_<from>_<to>.json`.
6. `npm run data:convert-dump -- data/finance/<dump> --from <m> --to <m>`:
   read the dry run, then again with `--out data/finance/<name>`. A problem
   writes nothing: report it, do not edit the dump.
7. Continue with `update-finances` from step 2 (find where the data stops),
   with the account's command from the notes.

## Sources

### Bybit card -- `bybit-card-api`

- Page: `https://www.bybit.eu/en-EU/cards/dashboard/transactions`.
- Endpoint: `POST /x-api/fiat/card/transaction/api/queryUserAssetRecordsV3`,
  body `{ "page": n, "limit": 100 }`, cookies (`credentials: 'include'`),
  headers `Accept` and `Content-Type: application/json`, `platform: pc` (no
  hook needed). Records: `result.data`, newest first; `result.total` is the
  count. Page until every record is read or a page's oldest record
  (`txnTime`, ms) is before the first month.
- Convert gives the card JSON; then `npm run data:convert-bybit -- <it>
  --known <every earlier Bybit CSV>` as `update-finances` step 3 says.
- **Fuel holds**: a pump's pre-authorisation (the merchant and the held
  amount are in the notes) stays pending in the list, which never shows what was finally booked. The card's
  rules skip it and list it: ask the user the booked amount and add
  `"importo_contabilizzato_eur": -<amount>` to that movement in the card JSON
  before `data:convert-bybit --out`.
- The available balance shows on the card's dashboard; ask or read it, and
  record it in `update-finances` step 6.

### Mediolanum -- `mediolanum-api`

- Login: `https://www.bmedonline.it/v3/app/ib_flutter_app_banca/index.html`
  (a Flutter app). In Brave the "Codice cliente" field may not take focus:
  ask the user to turn Shields off for the site or delete its site data.
  Once in, open the current account (`#/home/account`).
- Endpoint: `GET /v3/api/ib-bff-sb-conti/v1/private/soggetti/<client>/conti/<account>/movimenti`
  -- take the path as the page called it -- with
  `tipologia_movimento=SALDO_MOVIMENTI&flag_movimenti_futuri=false&flag_movimenti_contabillizati=true&flag_calcolo_saldi_totali=true&page=<n>&size=100`
  and the captured headers. Records: `data.elencoMovimenti`, newest first;
  stop at a short page. It returns the whole history: the months are chosen
  by the conversion.
- Check: over the whole history, the records' `importo` add up to the
  account's balance on the page.

### Crédit Agricole -- `credit-agricole-api`

- Page: `https://nowbanking.credit-agricole.it/#/accounts` (Lista
  movimenti). A promotional popup may cover it after login: close it.
- Endpoint: `POST /API/BankAccount/Activities/GetMovementsList`, body
  `{ "MaxRecords": 5000, "DateStart": "<first day>T00:00:00+01:00", "DateStop": "<last day>T00:00:00+01:00", "Cause": "" }`,
  the captured headers less `request-id`, `traceparent` and
  `x-correlation-id`. Records: `movements`, newest first, with the balance
  after each. The bank keeps about two years online.
- Check: the newest record's `finalBalance` is the account's balance
  (`GET /API/BankAccount/Balance/GetBalance`, as the page calls it).

## When a recipe breaks

The endpoints are the banks' own and undocumented. When one returns nothing
or an error, read the page's requests again (`read_network_requests`), find
the call that lists movements, and update this file in the same branch as
any converter change. If a record's fields changed, the converter reports a
problem per record: fix `scripts/statement-import/convert/api-dump.js` with a
test, never the dump.
