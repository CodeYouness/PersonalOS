# Coding standards

Read at review, against a diff. These are the judgement calls -- the rules no
linter can check. The mechanical ones are enforced, not listed here:
`eslint.config.mjs` (no `@/` in `lib/`, no adapter outside the store, no
`process.env` outside `lib/config/env.js`, no `toISOString().slice`, no empty
block) and `tests/app/route-conventions.test.js` (every route and page is
`force-dynamic`). The non-negotiable rules in `CLAUDE.md` apply as well.

## Where a rule lives

- **A domain refusal lives in the store or the adapter.** A route checks the
  request's shape -- a JSON object, only the fields it edits, the record
  exists -- and maps the store's error to a status. "A done goal is not
  edited" belongs in `updateGoal`, where every caller meets it; a check only
  in the route is one script away from being bypassed.
- **A new operation mirrors its nearest sibling.** `completeGoal` reads like
  `completeTask`, a goal route like its task route: same guards, same order,
  same status codes, same ADR references in the comments. A difference
  is a decision, and says why where it is made.

## Screens

- **A selection is tracked by id**, in the address (`?task=<id>`,
  `?goal=<id>`), never by index in a list: a capture can insert a row while
  a panel is open.
- **A failed write re-reads the real state.** The panel shows the saved value
  again and refreshes; the screen never keeps telling a story that was never
  saved.
- **Numbers are right-aligned in tabular figures**, and formatted in
  `components/format.js` -- one implementation per format, so two screens
  never round the same number differently.
