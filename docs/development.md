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

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on :3000, on your real `data/personalos.json` |
| `npm run dev:sandbox` | The same on a throwaway copy of the seed, removed when it stops. **For checking a change in the browser.** It follows `data/seed.json`: a branch switch that changes the seed starts the sandbox again from it. It prints whether the model is on -- a key exported in your shell counts, not only `.env.local` -- since a model path checked there calls the real API. `-- -p 3100` for another port |
| `npm run build` | Production build. Stricter than dev -- things pass `dev` and fail here |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc -p jsconfig.json`: JSDoc types, `checkJs`, strict |
| `npm test` | Vitest, once |
| `npm run test:watch` | Vitest, watching |
| `npm run verify` | All four, in order. **The gate.** |
| `npm run check:secrets` | Fails if personal data, a credential or a sync conflict copy (`route 2.js`, from iCloud) is tracked. Lint and typecheck skip an untracked copy, so a stale one never fails `verify` |
| `npm run data:reset` | Restore `data/personalos.json` from the seed, backing up whatever was there first |
| `npm run data:remove-demo-finance` | Remove the seed's demo accounts, balances, trades, transactions and snapshot from `data/personalos.json`, backing it up first. Yours to run once, before recording your own money; categories and all non-finance data stay, and a second run removes nothing. A demo account goes with everything recorded on it, yours included |
| `npm run data:import-sheet -- <download.xlsx> <mapping.json> [--write]` | The one-off import of the finance spreadsheet (#132). Without `--write`, a dry run: reads the xlsx download and the private mapping -- keep it in `.scratch/`, it holds your names -- and prints what it would create and every row that needs attention (refunds, purchases with no single trade, unmapped pairs and accounts, skipped and rounded rows), writing nothing. With `--write`, after a backup, it imports accounts, opening balances, transactions and trades, sets "tracked since" unless it is set, and the default account when the mapping names one. It refuses, writing nothing, while demo finance rows are present, once the sheet is imported, or while the report lists anything unresolved. **Run order:** `data:remove-demo-finance`, then the dry run, then -- with `npm run dev` stopped -- `--write`. To run it again, restore the backup it printed |

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

`npm run dev:sandbox -- -p 3100`, driven with the Playwright MCP. Four things
the tool will not tell you:

- **The model.** The banner says `model: on` or `off`, and a key exported in
  your shell counts. Off, a question answers "No model configured". To see a
  path that returns before the model is called, start it with a fake key
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

## Deployment

Not yet. The local path runs on your machine and has no public address. Putting
this online means a real database and a password gate in front of everything --
the moment a deploy finishes, your net worth has a public URL. That work is
scoped in `docs/roadmap.md` and must not be started piecemeal.
