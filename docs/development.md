# Development

## Setup

```bash
nvm use            # Node 22, per .nvmrc
npm install
cp .env.example .env.local
npm run dev
```

Everything in `.env.local` is optional on a fresh clone. The app runs on seed
data with no key set; each variable switches on the feature next to it.

Each model call has its own model (ADR 0030): `ANTHROPIC_MODEL_CLASSIFY` files
a capture, Refile included; `ANTHROPIC_MODEL_EXTRACT` reads a journal entry
for what is worth remembering; `ANTHROPIC_MODEL_ANSWER` answers a question;
`ANTHROPIC_MODEL_CHECKIN` reads the check-in's open answer for the records it
names.
Unset, each falls back to its entry in `defaultModels` in
`personalos.config.js`. `ANTHROPIC_MODEL` is gone and no longer read -- delete
it from an old `.env.local`, it changes nothing.

## Commands

| Command | What it does |
| --- | --- |
| `npm run serve` | **The one writer** (ADR 0032). A production build, then `next start` on :3000, on your real `data/personalos.json`, listening on `127.0.0.1` only. It takes a lock on the data directory (`data/serve.lock`, holding its pid); a second `serve` refuses. Code changes reach it only when you stop it and run it again. A lock whose process is gone is stale and is taken over |
| `npm run dev` | Development server on :3000, on your real `data/personalos.json`, on `127.0.0.1` only. **Refuses to start while `serve` runs**, naming its process and how to stop it. `-- -p 3100` for another port |
| `npm run dev:sandbox` | The same, also on `127.0.0.1`, on a throwaway copy of the seed, its habit history moved to recent days, removed when it stops. It neither takes nor checks the lock. **For checking a change in the browser.** It follows `data/seed.json`: a branch switch that changes the seed starts the sandbox again from it. It prints whether the model is on -- a key exported in your shell counts, not only `.env.local` -- since a model path checked there calls the real API. `-- -p 3100` for another port |
| `npm run build` | Production build. Stricter than dev -- things pass `dev` and fail here |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc -p jsconfig.json`: JSDoc types, `checkJs`, strict |
| `npm test` | Vitest, once |
| `npm run test:watch` | Vitest, watching |
| `npm run verify` | All four, in order. **The gate.** |
| `npm run check:secrets` | Fails if personal data or a credential is tracked |
| `npm run shortcuts:build` | Builds the three iPhone Shortcuts from `lib/shortcuts.js`, signs them with this Mac's iCloud account and writes them to `~/Downloads/PersonalOS-Shortcuts` (ADR 0036). macOS, with Tailscale running or `--host https://<mac-host>`. No token is written in: it is asked for on import. Install steps in `docs/shortcuts.md` |
| `npm run data:reset` | Restore `data/personalos.json` from the seed, backing up whatever was there first |
| `npm run data:remove-demo-finance` | Remove the seed's demo accounts, balances, trades, transactions and snapshot from `data/personalos.json`, backing it up first. Yours to run once, before recording your own money; categories and all non-finance data stay, and a second run removes nothing. A demo account goes with everything recorded on it, yours included |
| `npm run data:import-degiro -- <transactions.csv> [--write]` | The one-off import of DEGIRO's transactions export (#219, ADR 0031). A dry run by default: prints the holdings, trades and prices it would write, the rows it skipped (bookkeeping, changes of exchange) and every warning or blocking row, writing nothing. With `--write`, after a backup, it writes one read-only holding per ISIN, ending each on the day its units arrived at Scalable. Needs `sc` logged in and the Scalable sync run first; refuses while demo rows are present or anything blocks. A second `--write` changes nothing. Keep the CSV out of the repository |
| `npm run data:import-statement -- <file.csv> [--format <id>] --account "<name>" [--account-for <product>="<name>" ...] [--write]` | Imports a bank or card statement as the transactions of its account (stage 2, ADR 0037, ADR 0041). Formats, in `scripts/statement-import/formats/`: `revolut` (Revolut's own Italian export; each `Prodotto` is its own account -- `--account` is `Attuale`, `--account-for Deposito="…"` the others), `card-normalised`, `bank-normalised-signed` and `bank-normalised-typed`; without `--format` the header chooses, and a header that does not match the declared format is refused. A dry run by default: per account, whether it exists or would be created (cash, EUR), the date range, how many movements are new, already imported and unchanged, or changed in the source's zone, the sum of the new ones, the skipped lines by reason, the opening balance a running balance makes known, and the **balance check** -- the file's last balance against the account's balance after the import, with the difference, never fixed. A file with no running balance leaves a new account unknown until you record a balance on Finances; the report says so. With `--write`, after a backup, it writes exactly that; it refuses, writing nothing, while anything blocks or demo finance rows are present, and a second run of the same file changes nothing and takes no backup. Your category, note, tags, counter account and not-counted flag survive every re-import. Stop `npm run serve` (and `dev`) before `--write`: it does not take the writer lock (ADR 0032). Keep statements out of the repository |
| `npm run data:import-ledger -- --movements <file.csv> --categories <file.csv> --accounts <file.csv> [--window <days>] [--account-map "<ledger name>=<account name>" ...] [--write]` | Gives the statements the categories of the ledger you kept by hand, from its CSV export (stage 2, ADR 0042); replaces the old `data:import-sheet`. Run it after the statements are imported. It creates the ledger's category tree (two levels; a top-level category is income when the ledger only ever files money in under it; `ricorrente` becomes a fixed cost on a subcategory it creates). A ledger account goes to the account of the same name, or the one `--account-map` names. On an account **with statements** each ledger row is matched to the one statement movement with the same signed amount within `--window` days (3 by default; same day first, one to one) and gives it its category, note, project tag and not-counted flag **only where still empty** -- what you set in the app is left alone; a row that matches nothing is listed, never imported. On an account **without statements** (created as cash when missing) the ledger is the source: its rows become transactions and its `saldo_iniziale` rows the opening balance, the day before its first movement. Transfers are written so each balance moves once (the table in ADR 0042): the end on an account the ledger feeds is always written, as a not-counted leg when the statement row is not found, removed by a later run that finds it. A payment to a broker is categorised and kept out of spending. For an account the ledger feeds, the balance after the import must equal the ledger's (opening plus rows) and its spending and income the ledger's counted rows, or the write blocks; money in counted as income but filed in a spending category is a refund, and the report says how much. A dry run by default: categories to create, accounts, per account the matches by days apart, fields filled and left alone, the unmatched ledger rows (30, then how many more), statement movements still uncategorised, transfers by case, opening balances and the **totals check** -- spending and income as the ledger counted them against what PersonalOS computes after the import, with the difference, never adjusted. With `--write`, after a backup, it writes exactly that; it refuses, writing nothing, while anything blocks -- among them demo finance rows and any `sheet` transaction this ledger does not plan -- and a second run changes nothing and takes no backup. Stop `npm run serve` (and `dev`) before `--write`. Keep the ledger out of the repository |
| `npm run eval:classify [-- --suite <classify\|checkin>] [-- --model <id> ...]` | Files a fixed set of made-up sentences on each model -- Haiku 5.5 and Sonnet 5.5 unless `--model` names others -- and prints, per model, the pass rate per field, the sentences it got wrong, the tokens and the cost of the run and of a capture (#197). **Calls the real API with your key and spends money**, so it is run on purpose and never by `verify` or CI. A case passes a meal's numbers within 25% of its estimate, everything else only on an exact match. Exits 1 when every call of a model failed -- an empty balance or a retired model -- and says why once, and when no key is set, calling nothing. `--suite checkin` reads 27 made-up check-in open answers, Italian and English, for the actions they name, against invented habits (the gym among them, counted from Training time, ADR 0039), categories and accounts (`scripts/eval-checkin/`): an answer passes when every expected action is read, in any order, with the params the case names, and nothing else but what the case marks optional. |
| `npm run measure:context [-- --model <id>]` | Counts with `countTokens` how many tokens a question at `limits.contextMaxChars` is on `claude-haiku-5-5` (or `--model`), and prints, for made-up transactions as the ledger import writes them (the worst mix today) and as bank statement lines (as `data:import-statement` files them; only the origin's source is sent, not the bank's detail), made-up journal text and the seed's own context, the characters, the tokens, the tokens a character and the largest limit for 90,000 and 100,000 tokens (#204, ADR 0030). The records are made up in memory and sent in the request `lib/answer.js` sends: no store, no data directory. `countTokens` is free, but it needs your key, so it is not part of `verify` or CI. Run it when the answer model or a kind of record changes, and carry its figures into `tests/lib/context-limit.test.js` and the ADR. |

## Types without TypeScript

There are no `.ts` files. Types are JSDoc comments, checked by `tsc` in strict
mode through `jsconfig.json`. You get the verification an agent can run without
the compile-fix-compile loop on every edit. `lib/domain/types.js` holds the
entity typedefs and has no runtime behaviour on purpose.

Annotate at boundaries -- function parameters, returns, anything crossing a
module edge. Inside a function, inference is usually enough.

## Testing

Not a large suite. A net under the things that lie silently when they break:

1. **The adapter contract** (`tests/store/adapter-contract.js`) -- the most
   valuable file here. Parameterised by adapter, so a future database adapter
   inherits it and it answers "is this equivalent?" directly.
2. **Pure domain functions** -- dates and timezones above all. The date tests
   run against zones other than yours, because the timezone trap only shows up
   on a machine that is not your laptop.
3. **Classification** -- the rule fallback is deterministic and gets tested;
   so does rejecting a destination the model invented.
4. **Route handlers** -- called as functions against a real store pointed at
   a sandboxed, throwaway data directory. No HTTP server, no real model
   calls.
5. **What a component renders** -- `renderToStaticMarkup` from
   `react-dom/server`, no DOM: a link or a button, an aria attribute, a note
   shown only sometimes (`tests/components/answer-panel.test.js`). `vitest.config.js`
   lets a test import a component's JSX. It shows the first render only: what
   happens after a click is still a check in the browser.

Not tested: pixels, real model calls, coverage as a target.

Tests set `DATA_DIR` to a temporary directory before importing anything, since
`lib/config/env.js` reads the environment once at import. That is why the
store import in `tests/store/json-adapter.test.js` is dynamic -- a test run can
never touch your real data. A `DATA_DIR` that is set but empty is refused at
that import, not read as the default: an empty value is what a shell variable
that matched nothing produces, and the default is your real data.

## Checking a change in the browser

`npm run dev:sandbox -- -p 3100`, driven with the Playwright MCP. What the
tool will not tell you:

- **The days.** The demo habit history is moved to end yesterday
  (`scripts/sandbox-seed.js`), so the streak runs up to today and the weekends
  in it are Deep work's days off. Meals, weights and notes stay on their
  January days.
- **One theme.** The app is light only, "Olive on bone"
  (`docs/design/ui-rules.md`, ADR 0038); there is no dark theme to check.
  The mockup is still dark: it shows layout, not the look.
- **The model.** The banner says `model: off`, or `model: on` with the model
  each call type will use, and a key exported in your shell counts. Off, a
  question answers "No model configured". To see a path that returns before the model is called, start it with a fake key
  (`ANTHROPIC_API_KEY=sk-ant-fake npm run dev:sandbox`): it works end to end,
  and a call that did reach the model would fail with a 502. To see an answer,
  stub the route with `page.route`.
- **Stubs outlive the call.** A `page.route` stays on the browser for every
  later call and `goto`. Start a check against the real server with
  `await page.unrouteAll({ behavior: 'ignoreErrors' })`, and assert something
  only the real response can say, such as a status or an outcome name.
- **The mockup.** Playwright refuses `file:`. Serve it:
  `python3 -m http.server 8765 --bind 127.0.0.1 --directory design`, and stop
  it when done.
- **Screenshots** are written only under the repo. Use `.playwright-mcp/`,
  which git ignores, and delete it afterwards.
- **The console.** Read it with `browser_console_messages` at level `error`
  before stopping the server, as a call of its own -- calls sent together may
  run at once. Once the server is down, the page logs failed hot-reload (HMR)
  connections that are not the app's errors.

## Always running, and the Dock (ticket #227)

`npm run serve` runs under a launchd user agent, so PersonalOS is up after
login and comes back when it exits. The definition is generated for this
checkout (`npm run launchd:plist`), so no path is committed.

```
mkdir -p ~/Library/Logs/PersonalOS
npm run --silent launchd:plist > ~/Library/LaunchAgents/personalos.serve.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/personalos.serve.plist
```

- **Check:** `launchctl print gui/$(id -u)/personalos.serve`, and open
  http://127.0.0.1:3000.
- **Remove:** `launchctl bootout gui/$(id -u)/personalos.serve`, then delete the plist.
- **Rebuild after a change:** `launchctl kickstart -k gui/$(id -u)/personalos.serve`
  restarts it, and `serve` builds again on start (give it a minute). `bootout`
  it first before `npm run dev` or any script that writes the data.
- **Logs:** `~/Library/Logs/PersonalOS/serve.log` and `serve.err.log`
  (`tail -f`). Build errors land there.
- **The Dock:** open http://127.0.0.1:3000 in Safari, File > Add to Dock (in
  Chrome, Install PersonalOS). The window uses the manifest's name and icon.

## Debugging

Server errors appear in the terminal running `npm run dev`. Browser errors
appear in the browser console. An error lives in exactly one of the two: if the
terminal is quiet, look at the console.

For a bug, write the failing test first and watch it fail. Otherwise "it works
now" is an opinion, rather than a command you can re-run in a month.

Next 16 changed APIs that most models were trained before. If code that
"should" work will not compile, read `node_modules/next/dist/docs/` before
trying again -- it resolves it nearly every time.

## Git

- Conventional Commits with a scope: `feat(store):`, `fix(crm):`, `docs(adr):`,
  `chore:`, `test:`, `refactor:`.
- One short-lived branch per ticket, squashed on merge, so a feature is a
  single revertible commit.
- `git status` before starting, `git diff` before saying you are done.
- Never `push --force`, `reset --hard` or `clean -fd` without stating first
  what will be lost.

## Before pushing

```bash
npm run verify
npm run check:secrets
git status          # no .env, no data/personalos.json, no keys
```

The repository is public. `check:secrets` runs in CI too, but by then the
commit exists, and git history does not forget.

## The phone over Tailscale

ADR 0032: the phone reaches two routes over the tailnet, with a token, and
nothing else. Not automated; check each step by hand.

**The token.** Put `PERSONALOS_PHONE_TOKEN=<a long random value>` in
`.env.local` (`openssl rand -hex 32`), then stop and run `npm run serve` again:
`serve` reads it when it starts. The phone sends it as
`Authorization: Bearer <token>`. It is read only in `lib/config/env.js`, never
behind a `NEXT_PUBLIC_` name, and never written in the repository or a
screenshot.

**The gate** is `lib/phone-gate.js`, called first thing in the capture route,
in every journal handler, and in the routes the phone will reach later -- the
check-in (`/api/checkin`) and a receipt line's undo:

- A request is *proxied* when it carries what `tailscale serve` adds: a
  `Tailscale-User-*` header, or an `X-Forwarded-For` naming the phone's
  tailnet address. Next itself sets `X-Forwarded-For` to `127.0.0.1` (or
  `::1`) on every local request, so a loopback address is the Mac's own.
  Without the right token a proxied request gets 401 and nothing is written.
- With no token configured, every proxied request gets 401: the gate fails
  closed.
- A request without those headers is the Mac's own browser. It needs no token,
  and the capture bar is unchanged.

The capture route's response also carries `receiptLine`, the receipt as one
line (`task · Filed “Call the accountant”`), built by the formatter the
capture bar uses (`formatReceiptLine` and `formatReceiptWhat` in
`lib/domain/format.js`), so a Shortcut can show it as it is.

**Put `tailscale serve` in front of `serve`.** `serve` listens on
`127.0.0.1:3000`. Expose the two paths and nothing else (use
`tailscale serve --help` for the flag spellings of your version; `funnel` is
never used):

```bash
tailscale serve --bg --set-path /api/capture http://127.0.0.1:3000/api/capture
tailscale serve --bg --set-path /api/journal http://127.0.0.1:3000/api/journal
tailscale serve status
```

The journal path reaches the routes under it (`/api/journal/<id>` and its
`extract` and `memories`), so those handlers use the gate too.

**Check that nothing else answers**, from the phone on the tailnet, with
`<host>` the Mac's tailnet name and `<token>` the token:

```bash
curl -i -X POST https://<host>/api/capture -H 'content-type: application/json' \
  -d '{"text":"a test sentence"}'                      # 401
curl -i -X POST https://<host>/api/capture -H 'content-type: application/json' \
  -H 'Authorization: Bearer <token>' -d '{"text":"a test sentence"}'   # 200, receiptLine
curl -i https://<host>/                                 # not served
curl -i https://<host>/api/captures                     # not served
curl -i https://<host>/api/health                       # not served
```

The test sentence is filed for real: undo it from the Inbox. Turn the
exposure off with `tailscale serve reset`.

## Deployment

Not yet. The local path runs on your machine and has no public address. Putting
this online means a real database and a password gate in front of everything --
the moment a deploy finishes, your net worth has a public URL. That work is
scoped in `docs/roadmap.md` and must not be started piecemeal.
