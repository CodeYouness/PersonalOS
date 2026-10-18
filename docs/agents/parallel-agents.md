# Parallel agents

Several agents in one working tree: a fan-out, a workflow. The orchestrator
is the one that builds, commits and decides; the agents write code and
report. Each prompt names this file instead of repeating it.

## Ownership

- **One owner per file.** The brief lists the files an agent owns. A file two
  agents would edit -- a shared test file, the config -- belongs to one of
  them; the others write their own new file.
- **Interfaces first.** When one agent's output feeds another's, the brief
  fixes the shape (a function's name and return, an id scheme) and the
  consumer runs after the producer, not beside it.

## Commands

- **Agents run** single test files (`npx vitest run <file>`), `npm run typecheck`
  and `npx eslint <files>`.
- **The orchestrator runs** `npm run verify`, `build`, `dev` and
  `dev:sandbox`. The last three write `.next`, and two writers collide with
  `ENOTEMPTY`.
- **Git is read-only for agents.** The orchestrator commits, so the diff it
  reviews is the one it reads.

## Tests and data

- A test copies `data/seed.json` into a `mkdtemp` directory and sets
  `DATA_DIR` before importing anything: copy
  `tests/app/questions-route-model.test.js`. `data/personalos.json` and
  `.env.local` are the user's, never opened.
- Fixtures are the seed's made-up records. The repository is public.
