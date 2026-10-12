# Coding standards

Read at review, against a diff. These are the judgement calls -- the rules no
linter can check. The mechanical ones are enforced, not listed here:
`eslint.config.mjs` (no `@/` in `lib/`, no adapter outside the store, no
`process.env` outside `lib/config/env.js`, no `toISOString().slice`, no
month or day key sliced by hand outside `lib/domain/dates.js`, no empty
block) and `tests/app/route-conventions.test.js` (every route and page is
`force-dynamic`). `tests/lint/` holds the config's date rules in place. The non-negotiable rules in `CLAUDE.md` apply as well.

## Where a rule lives

- **A domain refusal lives in the store or the adapter.** A route checks the
  request's shape -- a JSON object, only the fields it edits, the record
  exists -- and maps the store's error to a status. "A done goal is not
  edited" belongs in `updateGoal`, where every caller meets it; a check only
  in the route is one script away from being bypassed.
- **A rule that reads a second field is enforced when that field changes
  too.** The sign of a balance means what the account's kind says, so a
  kind change on an account with balances is refused -- otherwise an
  overdraft becomes a negative debt by a patch the sign rule never sees.
  Check every write path to each field the rule reads.
- **A new operation mirrors its nearest sibling.** `completeGoal` reads like
  `completeTask`, a goal route like its task route: same guards, same order,
  same status codes, same ADR references in the comments. A difference
  is a decision, and says why where it is made.

## Routes

- **A route that only the model can answer reports the model's outcome.**
  Capture never fails on the model: rules sit underneath it. A route with
  nothing underneath -- extraction, `app/api/journal/[id]/extract/route.js`
  -- answers "no model configured" as a 200 with `outcome: 'no-model'`,
  since a missing key is an answer, and a model that did not answer as a
  502 with `outcome: 'failed'`, which the screen offers to retry. The
  model's own error stays in the server log. The next such route mirrors
  this one.

## Screens

- **A helper two components share lives in a module named for the
  feature** (`components/finance.js`), never in the first component that
  needed it -- an address builder, a label map, a colour rule. Otherwise
  the second component imports a card it has nothing to do with, and the
  helper is found only by remembering who wrote it first.

- **A selection is tracked by id**, in the address (`?task=<id>`,
  `?goal=<id>`), never by index in a list: a capture can insert a row while
  a panel is open.
- **A failed write re-reads the real state.** The panel shows the saved value
  again and refreshes; the screen never keeps telling a story that was never
  saved.
- **Numbers are right-aligned in tabular figures**, and formatted in
  `components/format.js` -- one implementation per format, so two screens
  never round the same number differently. A format the
  question context also writes (a percent, a weight, a month) lives in
  `lib/domain/format.js` and `components/format.js` re-exports it, so an
  answer's figure and the screen never disagree.
