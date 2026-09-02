@AGENTS.md

# PersonalOS

A single-user personal dashboard. You say a thing once -- typed or spoken --
and the system decides where it belongs, files it, and the cards read it back.
Everything else is display.

Built from a written spec (`docs/spec.md`). **This repository, not the spec, is
the operational source of truth.** When a decision changes, change the docs and
record why in an ADR. Never leave the spec saying A, the docs saying B and the
code doing C.

## Stack

Next.js 16 (App Router) · JavaScript with JSDoc types (`checkJs`) · JSON file
storage on the local path · ESLint + Vitest. Node 22.

## The four rules that are not up for negotiation

1. **All reads and writes go through `lib/store.js`.** No component and no
   route handler touches storage. This is what keeps swapping JSON for
   Postgres a one-adapter job.
2. **Capture never fails. At worst it files badly.** Below every model call
   sits a rule-based classifier. If a sentence can be lost, the system has
   broken the only promise that matters.
3. **Loading a page never calls the model.** Cards read the last saved value.
   The model runs on a capture, a question, a button you pressed, or a
   scheduled job. Nothing else.
4. **"What day is it" has one answer**, `lib/domain/dates.js`, in
   `USER_TIMEZONE`. Never `new Date().toISOString().slice(0, 10)`.

## Layout

```
app/            routes and screens; the only place that may use the @/ alias
lib/store.js    the data layer facade -- the only import for data
lib/adapters/   contract + the JSON implementation
lib/domain/     pure domain: dates, ids, types
lib/config/     the only module that reads process.env
personalos.config.js   product configuration for anyone cloning this
data/seed.json  demo starting state, versioned, never written to
docs/           architecture, domain, development, roadmap, decisions
```

## Rules for changing things

- `lib/` must run under plain Node: **relative imports only, no `@/` alias.**
  Scripts and one-off migrations depend on that.
- Adding a capture destination means editing `personalos.config.js` and
  nothing else. The list is validated against; a destination the model invents
  is rejected, never written.
- Validate at the boundary. Model output, request bodies and env values are
  untrusted until checked.
- Never an empty `catch`. On a failed write, re-read the real state instead of
  leaving the screen telling a story that was never saved.
- Data routes declare `export const dynamic = 'force-dynamic'`.
- Track a selection by id, never by index in a list. A capture can insert a row
  while a detail panel is open.
- Numbers: right-aligned, tabular figures, formatting in one module.
- Do not edit `data/personalos.json` or `.env.local` -- they are the user's.

## Before you say it is done

```
npm run verify     # lint + typecheck + test + build
```

Then check the behaviour in the browser and read `git diff`. For a bug, write
the failing test first, watch it fail, then fix it -- otherwise "it works" is
an opinion.

## Before a substantial change

Read the architecture, find the modules involved, check `docs/decisions/` for a
decision that already covers it, propose a plan, implement, test, update the
docs if a behaviour changed, add an ADR if a new decision was made, read the
diff, commit. `docs/workflow.md` has the long form.

## Git

Conventional Commits with a scope (`feat(store):`). One branch per ticket,
squash on merge, so a feature is one revertible commit. Never run a destructive
git command without saying first what will be lost.

## Personal data and secrets

**The GitHub repository is public.** Secrets live only in `.env.local`; no key
ever gets a `NEXT_PUBLIC_` prefix, which ships it to the browser. Personal data
lives only in `data/personalos.json`, which is ignored. `npm run check:secrets`
before pushing. Git history does not forget.

## Traps already paid for

- The timezone one (rule 4). It sleeps on a laptop and wakes up on a server.
- Goals never auto-reset. A habit belongs to a day, a promise does not.
- `overdue` is a state reached by time passing, never an input value.
- Next 16 changed APIs since most training data. If code that "should work"
  will not compile, read `node_modules/next/dist/docs/` before retrying.

## Deeper

`docs/architecture.md` (layers and boundaries) · `docs/domain.md` (what the
words mean) · `docs/development.md` (how to work here) ·
`docs/roadmap.md` (what is built and what is next) · `docs/decisions/` (why).
