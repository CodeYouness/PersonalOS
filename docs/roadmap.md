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
| 9 | **Capture route** | **Done.** `app/api/capture/route.js`. Writes the capture, a memory entry, the links and an event; `task` and `people` file a task linked to the person the sentence names (never creating one, ADR 0018), `goals`, `appointment` and `nutrition` their own record (a meal, estimated by the model when there is one, ADR 0019), `health` a weight when the sentence names one in kg (#84, ADR 0020); `finance` and `memory` file as capture + memory only until their card exists and a real minimal record is possible. |
| 10 | **Capture bar + receipt** | **Done, text only.** `components/CaptureBar.js`, mounted once in `app/layout.js`. idle → processing → done/error → idle, ported from `design/mockup.html`'s `data-state` toggling; `error` is new, since a capture that never lands must still say so. Speech recognition (the mockup's `listening` state) is not built. |
| 11 | **Capture log drawer** | **Done.** `components/CaptureLogDrawer.js`, `components/Topbar.js`, `app/api/captures/`. Undo and Refile are refused once the produced record has been touched (ADR-0013); Delete carries a confirmation and has no such guard. |
| 12 | **Cards, one per commit** | ~~Today~~, ~~Session~~, ~~Calendar~~, ~~Habits~~, ~~CRM~~, ~~Nutrition~~, ~~Health~~, ~~Goals~~, ~~Finance~~. **Calendar card done** (#29): appointments from capture and from `npm run sync:calendar` (#31, ADR 0014). **Habits home card done** (#37): tick a check, +1/-1 a counter, ring and streak. **Habits screen's manage list done** (#38): add, rename, retarget, archive, restore and reorder at `/habits`, reachable from the nav and the card's Open. **Habits history done** (#39): a 30-day heatmap at `/habits`, one row per habit and one cell per day, every cell a correction of that day. **Habits summary done** (#40): completion, the streak, perfect days and days recorded over the same 30 days, above the heatmap. **CRM board done** (#52): every open task at `/crm` in Overdue / Today / This week / Later, with who it involves, temperature, tags and age; **CRM detail panel done** (#53): select a ticket (`/crm?task=<id>`) to edit its title, note, band, temperature and tags in place; it says where the task came from. **Complete, Reopen and Delete done** (#54): complete from the panel (it stays open to Reopen), delete after a confirmation. **Person field done** (#55): pick one of your people, clear, or "Add '<name>'" from the panel. **By person done** (#56): `/crm?view=person` groups the same open tasks by who they are owed to, whoever waits hardest first — the CRM screen is complete. **Nutrition screen done** (#69): today's calories against the target, protein, carbs and fat in grams, and the day's meals at `/nutrition`; a nutrition capture files a meal (#68), estimated by the model when there is one (#70); **Describe a meal done** (#71): the card's own box files a capture as `nutrition`. **Edit a meal done** (#72): select a meal to correct its name, time and numbers in place; a macro recomputes calories, any correction clears "est.". **Delete a meal done** (#73): after a confirmation; the capture keeps its sentence -- the Nutrition screen is complete. **Health specified** (#81): the last 30 days next to today's card, and weight from a `health` capture (ADR 0020); a `health` capture files a weight (#84), read by the model when there is one (#85). **Health card done** (#86): on the Nutrition & Health screen, the averages over the 30 days before today, the latest weight and its change, and one row per recorded day. **Correct a past meal done** (#87): open a day in the table to correct or delete its meals -- the Health card is complete. **Goals specified**: open goals on a read-only home card and a `/goals` screen to correct, close, reopen and delete them; a goal slips but never expires (ADR 0021). **Goals screen done** (#96): the open goals at `/goals`, reachable from the nav, grouped This week / This month / Open, nearest target date first; a row shows a project mark, progress, the target date (in the warning colour once passed) and, once slipped, the period it is in -- "2nd week". **Goals home card done** (#97): the same groups on Home next to Calendar, read-only; Open and every row go to the screen. **Goals panel done** (#98): select a goal (`/goals?goal=<id>`) to correct its name, kind, horizon, target date and progress in place; a different horizon restarts its age. **Done and Reopen done** (#99): Done closes a goal and records `goal.completed` once; done goals sit in a collapsed group at the foot of the screen, each with Reopen, which writes no event; a done goal is reopened before it is edited. **Delete a goal done** (#100): after a confirmation, with its links; the capture keeps its sentence -- the Goals card and screen are complete. **Finance specified** (#111): net worth from balances and holdings, everything EUR. **An overdraft counts against net worth** (#120): the sign of an observation means something, a debt is the positive amount owed. **Demo finance rows removable** (#112): `npm run data:remove-demo-finance`, with a backup. **Finances screen done** (#113): net worth, the allocation bar and the account table at `/finances`; **add an account and record a balance** (#114); **correct and delete balances, rename, archive and delete an account** (#115), archiving on a day; **holdings** (#116): an investment valued by units, with buys and sells; **prices** (#117), and correcting trades and prices; **the history** (#118): month-end net worth and the 30-day change, derived rather than stored (ADR 0022). **Pulse card done** (#119): net worth, twelve month-ends, the 30-day and 1-year changes and "as of" on Home, in the mockup's slot -- the Finance card and screen are complete. |
| 13 | **Journal screen** | Write freely, see the day, and later be asked what is worth remembering. |
| 14 | **Questions route** | Whole context to the model, every claim citing its source. |
| 15 | **Finance transactions** | Import a movement log, file a spending sentence from capture as a Transaction, spending and income by category, and a buy's cash leg as a transfer -- the piece that lets the net-worth spreadsheet be retired. Whether cash then stays observed or is derived from movements is decided there. **Specified** (#132). **Transactions are signed** (#133, ADR 0023): the amount is signed from its account's side, a transfer is a transaction with a counter account, and `notCounted` and `tags` are yours. **Record, correct and delete a movement** (#134): a movement form on `/finances` -- money out, money in or a transfer -- the month's transactions under `?month=`, and a panel (`?transaction=<id>`) to correct any field in place or delete after a confirmation. **A cash account follows its movements** (#135, ADR 0024): between two balances, an account valued by balance is its latest balance plus the movements after it, so the account table, net worth and the history move with every movement. |

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
- **Gain and loss per holding** -- value minus what was paid, fees included.
  The trades already hold it; it is display work.
- **Exchange rates**, and with them a second currency and written snapshots
  (ADR 0022).

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
- `lib/` uses relative imports; `app/` and `components/` may use `@/`.
- One card, one commit, and `npm run verify` before calling it done.
