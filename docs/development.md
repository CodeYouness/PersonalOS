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
| `npm run dev` | Development server on :3000 |
| `npm run build` | Production build. Stricter than dev -- things pass `dev` and fail here |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc -p jsconfig.json`: JSDoc types, `checkJs`, strict |
| `npm test` | Vitest, once |
| `npm run test:watch` | Vitest, watching |
| `npm run verify` | All four, in order. **The gate.** |
| `npm run check:secrets` | Fails if personal data or a credential is tracked |
| `npm run data:reset` | Restore `data/personalos.json` from the seed, backing up whatever was there first |

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

Not tested: pixels, real model calls, coverage as a target.

Tests set `DATA_DIR` to a temporary directory before importing anything, since
`lib/config/env.js` reads the environment once at import. That is why the
store import in `tests/store/json-adapter.test.js` is dynamic -- a test run can
never touch your real data.

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
