# Roadmap

What exists, what comes next, and in which order. Update the status in the
same commit that changes it.

The order is not arbitrary. Capture is built before the cards because
everything else reads what capture writes, and the cards go from easiest to
hardest so each finished one is usable the same evening.

## Done

| # | Piece | Where |
| --- | --- | --- |
| 0 | Scaffold, conventions, `npm run verify`, CI | root |
| 1 | Product configuration and environment access | `personalos.config.js`, `lib/config/` |
| 2 | Date primitive in the user's timezone, stable ids | `lib/domain/` |
| 3 | Data layer, adapter contract, JSON adapter, seed | `lib/store.js`, `lib/adapters/` |
| 4 | Bootstrap shell and health route | `app/` |
| 5 | **Foundation v2** — links, events, journal, memory types, derivations, finance, integration contract, schema migration | see below |

### What Foundation v2 added

- **Links** as the only relation mechanism, with a closed vocabulary (ADR 0006)
- **Events** replacing the activity log, typed and day-keyed for a timeline
- **Journal**, separate from memory, with provenance enforced (ADR 0007)
- **Memory v2**: type, confidence, validity window, tags
- **`bandSetOn`** on tasks; `overdue` is now derived (ADR 0008)
- **`lib/domain/derive/`**: tasks, habits, nutrition, finance
- **Finance**: accounts, observations, transactions, snapshots (ADR 0009)
- **Integration contract** and `SyncState`, with no concrete integration (ADR 0010)
- **Schema migration** v1→v2, idempotent, with a backup

## Next

| # | Piece | Notes |
| --- | --- | --- |
| 6 | **Mockup, revised** | The design in `design/mockup.html` predates v2. Habits has its own screen and every aggregating card has a period selector; both now have a data model underneath. |
| 7 | **Port the mockup** | **Shell, Today and Session done.** `Topbar`, `TodayCard`, `SessionCard` live in `components/`, styled via `app/globals.css`. Session's mockup "Blocked" section is left out: `involves` only means a person takes part, not that a task is waiting on them, and there is no signal yet to tell the two apart. Needs a real domain decision (likely a new link relation) before it can be built honestly. Still to come: the other four screens and their cards. |
| 8 | **Classifier** | **Done.** `lib/classify.js`. Model first, keyword rules underneath, records which one answered. Rules reliably cover task/finance/nutrition/health/goals; people and memory have no reliable keyword (a "call/email" rule for people misfired on plain tasks) and fall back to task without a model. |
| 9 | **Capture route** | **Done.** `app/api/capture/route.js`. Writes the capture, a memory entry, the links and an event; `task` and `goals` get a destination record, the other five file as capture + memory only until their card exists and a real minimal record is possible. |
| 10 | **Capture bar + receipt** | Four states, browser speech recognition, and the receipt saying where it went and who decided. |
| 11 | **Capture log drawer** | The long form of the receipt: recent captures with their route, undo, refile, delete. |
| 12 | **Cards, one per commit** | ~~Today~~, ~~Session~~, Calendar, Habits, CRM, Nutrition, Health, Goals, Finance. |
| 13 | **Journal screen** | Write freely, see the day, and later be asked what is worth remembering. |
| 14 | **Questions route** | Whole context to the model, every claim citing its source. |

## Planned, designed, not built

- **xlsx transaction import.** The model is ready: `upsertTransactionByOrigin`
  with `(source, externalId)`, and the two ownership zones so a re-import
  never wipes a category you set. What is missing is the shape of the real
  spreadsheet.
- **Broker portfolio sync** via its MCP, writing observations. Read-only
  scope; credentials live where the sync runs, never in the app (ADR 0010).
- **Sources screen** driven by `SyncState`. Staleness has to be visible.
- **Recurring charge detection** from transactions — the feature that repays
  importing a bank export.
- **AI context builder** (`buildContext`), so no feature writes its own prompt.
- **Demo mode** via `PERSONALOS_MODE`.
- **Timeline view** over `events`.
- **Goal progress derived** from linked tasks and habits instead of typed in.

## Deliberately not now

**Going online.** A public URL means a real database, a password gate in front
of everything, and secrets in a hosting panel. The moment a deploy finishes,
your net worth has a public address, so the gate is built before the deploy.
Telegram capture, embeddings, the morning briefing and automatic backup all
gate on that decision and are flagged off in `personalos.config.js`.

**A graph UI.** The model can represent the graph; nothing needs to draw it
yet.

**Budgets, and the weekly AI review.**

## Working from the guide's prompts

The guide's build prompts assume a freshly created, otherwise empty project,
and predate Foundation v2. Before pasting one, check:

- Data goes through `lib/store.js`. "Read the JSON file" means "add a store
  function".
- Relations are links, not fields. A prompt that says `personId` means a link.
- Vocabularies come from `personalos.config.js`, never inline.
- "Today" comes from `lib/domain/dates.js`; computed numbers come from
  `lib/domain/derive/`.
- `lib/` uses relative imports; `app/` may use `@/`.
- One card, one commit, and `npm run verify` before calling it done.
