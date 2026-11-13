# Architecture

## The shape of the thing

PersonalOS is not a dashboard with sections. It is one repeated gesture — you
say something — plus a graph of what that produced, and everything else is
consequence.

```
   text (capture bar, voice, later Telegram)
        |
        v
   classify()  ->  { destination, title, person, urgency }
        |          model first, keyword rules underneath, never fails
        v
   normalise -> link -> lib/store.js writes:
        |          the raw capture, a memory entry, the destination record,
        |          the links between them, and an event
        v
   cards read the last saved value -- never the model, never an integration
```

## Layers

| Layer | Where | May depend on |
| --- | --- | --- |
| Screens and routes | `app/` | `lib/store.js`, `lib/actions/`, `lib/domain/`, `lib/domain/derive/`, config |
| Actions | `lib/actions/` | `lib/store.js`, `lib/domain/`, config -- never imported by the store |
| Data access | `lib/store.js` | the active adapter; `lib/domain/` and `personalos.config.js` for the operations that span entities (filing a capture, correcting one) |
| Storage adapters | `lib/adapters/` | `lib/domain/`, `lib/config/` |
| Derivations | `lib/domain/derive/` | `lib/domain/` only — pure functions |
| Pure domain | `lib/domain/` | nothing |
| Integrations | `lib/integrations/` | `lib/store.js`, `lib/domain/` |
| Configuration | `lib/config/`, `personalos.config.js` | `lib/domain/` (dates, to inject the timezone) |

Five rules hold this together, and each is enforceable rather than
aspirational.

**Nothing reaches storage except through `lib/store.js`.** Not a component,
not a route handler, not a script. When that holds, moving from a JSON file to
Postgres is a rewrite of one adapter.

**`lib/` runs under plain Node.** Relative imports only, no `@/` alias, no
bundler assumptions. The alias belongs to `app/` and `components/`. This is
what lets a one-off migration or an import script reuse the real data layer
instead of reimplementing it.

**Derivations live in `lib/domain/derive/`.** One implementation per question.
A card never computes "is this overdue" itself.

**Integrations write; they are never called during a render** (ADR 0010).

**`lib/domain/` never imports configuration** (ADR 0012). It must stay safe
to import from a client component, and `lib/config/env.js` also carries
secrets that must never reach a browser bundle. So the dependency runs the
other way: `env.js` hands `lib/domain/dates.js` the configured timezone
through a function call at import time, rather than `dates.js` importing
`env.js` to read it.

## The graph

Relations are their own collection (ADR 0006). Every id carries its entity
type as a prefix, so a reference is a self-describing string, and
`lib/domain/refs.js` validates one at the boundary.

Reading a relation is a join, so the store exposes named domain operations —
`getTasksForPerson`, `getTasksForGoal`, `getMemoryOrigin`, plus the generic
`getRelated` / `getReferrers`. A component asks for the tasks of a person; it
never asks for links with rel `involves`.

## The adapter contract

`lib/adapters/contract.js` lists the operations an adapter must provide, in
the language of the domain. `tests/store/adapter-contract.js` is a suite
parameterised by adapter: the JSON one runs it today, and a database one will
run the same file. That is why the contract is a file and not a comment.

## Schema versions

The document carries `schemaVersion`. `lib/adapters/json/migrations.js` is a
pure function from an old shape to the current one — pure so it can be tested
without a disk, idempotent because every read of an old file calls it. The
caller copies the file aside before rewriting it. The one input beyond the
document is the configured timezone: v8 resolves `horizonSetOn` to the
user's day (ADR 0021), so a test sets it with `setDefaultTimezone`.

The seed is versioned with the code and must never be behind it; `readSeed`
throws if it is.

## Data flow, concretely

- A **read** in a screen: server component or route handler calls
  `lib/store.js`, then a function from `derive/` if a number is involved.
- A **write** from the UI: the screen posts to its route and the route calls
  the store. A write that changes one value may update optimistically and
  roll that value back on failure (`HabitsList`); a write that changes the
  shape of a list -- its order, its membership -- posts first and re-renders
  from what the server actually holds (`HabitsManager`), because there is no
  single value to roll back. Either way a failure re-reads real state rather
  than leaving the screen telling a story that was never saved.
- A **capture**: classify decides a destination; the same request writes the
  capture, a memory entry, the destination record, the links, and an event.
- A **sync**: runs outside the request cycle, writes observations or
  transactions through the store, updates its `SyncState`.

## The action registry

`lib/actions/registry.js` (ADR 0037) names every write a channel can make on
your behalf -- a capture, an answer in the check-in, later Telegram and the
skills. Each action is a definition in `lib/actions/definitions/`: a JSON
Schema for its params (a model's tool input schema too), a risk class, a
`parse` that reuses the domain's checks, a `run` that calls a write the store
already has, an `undo`, and the receipt line. The store holds the rules; an
action adds none, so a write made through an action and the same write made
from a screen land the same.

`runActions` runs a list in order and returns a receipt, one line per
request. A request with an unknown name or bad params writes nothing; one
the store refuses is filed as failed; one failure never stops the rest, since
each is its own queued write (ADR 0011). Every action that ran is kept as a
record in the store's `actions`, with what undo restores, so `receiptFor`
rebuilds the receipt after a refresh and `undoAction` -- behind
`POST /api/actions/[id]/undo` -- undoes one line, refused once what it wrote
was touched since (ADR 0013's rule). Reading a receipt reads the store and
nothing else (rule 3).

The registry sits above the store and depends on it; the store never imports
the registry, so `lib/store.js` stays the one way to the data and an action is
just another caller.

## The check-in

The check-in (ADR 0037) is the registry's first caller. Its questions are
**derived**, never stored: `checkinQuestions` in
`lib/domain/derive/checkin.js` reads the day's log and the habits -- a habit
scheduled that day, mood, energy, time, and the open question -- and says
which the day already answers. Its answers **go through the registry**:
`lib/checkin/closed.js` turns a closed answer into action requests by rules,
and `lib/checkin/day.js` recomputes the questions from the store (never
trusting a client's list), runs the requests under the origin `checkin` and
returns the lines. `GET /api/checkin` asks a day; `POST /api/checkin` files a
list of answers and answers with the questions recomputed, that request's
lines and the day's whole receipt. Both are behind the phone gate. No model
anywhere in either -- held by `tests/lint/checkin-no-model.test.js`, which
walks every import the route reaches. The open answer is, for now, only a
journal entry; reading it for records is the next tier.

The check-in's screen is the panel at the top of Home: a server component
(`components/CheckinPanel.js`) reads the day through `lib/checkin/day.js`
and hands it to a client panel whose state transitions live in a pure
reducer (`components/checkinReducer.js`). The panel shows the server's state
-- what the page was rendered with, or what the route answered -- and keeps
only what has not been sent yet.

## Extension points

- **Storage.** Add `lib/adapters/<name>/`, implement the contract, run the
  suite, switch the adapter in `lib/store.js`.
- **Relations.** Add a `rel` to `LINK_RELS` and document it in `domain.md`.
- **Destinations.** `DESTINATIONS` in `personalos.config.js`.
- **Actions.** A definition in `lib/actions/definitions/`, listed in
  `lib/actions/registry.js`, documented in `domain.md`'s table.
- **Integrations.** Implement the contract, register it, flag it in config.
- **Model provider.** Classify, extract and answer each make one forced-tool
  call through `callTool` in `lib/ai/provider.js` (ADR 0037); only
  `lib/ai/providers/anthropic.js` imports the SDK, which ESLint enforces.
- **Cards.** Each owns a screen section and its own API route, and never
  reaches into another card's data.

## The AI context layer

`lib/ai/context/` (#172, ADR 0028) is what the model is allowed to know when
it answers. It is built for questions first; the classifier and extraction
keep their own prompts until they move. One entry point:

```
buildContext('question') -> { today, week: { from, to }, timezone, trackedSince, items, summarised, tooLarge }
item = { id, type, label, content, labels, opens }
```

An item is one thing a screen shows, written as plain text and cited by `id`:
the record's own reference, or `profile`. `read.js` reads every collection
whole through `lib/store.js` -- no default page, no window -- because "not in
your data" is a claim about the whole archive; `getLoggedDays` exists so the
day-keyed daily logs can be read that way. `build.js` is pure: links become
words on the records they join, a capture that filed a record rides on it, a
memory that only repeats its capture is left out, and `labels` say how a
record stands (`done`, `overdue`, `archived`, `expired`, `unconfirmed`;
`overdue` is `isOverdue` from `lib/domain/derive/tasks.js`, so a done task is
never overdue). A computed number is never written a second time: an account's
value comes from `accountValueOn` (rule 6). Event payloads are not sent beyond a short list of
vocabulary keys, since one of them holds the sentence of a deleted capture.

**Computed figures** (#174) are appended after the records: `figures-finance.js`
and `figures-life.js` call the derivations the screens call (`financeOverview`,
`flowMonths`, `monthFlows`, `savingsRate`, `yearFlows`, `streak`,
`windowSummary`, `historyRows`, `healthAverages`, `weightTrend`, `dayTotals`,
`goalBoard`) with the screens' arguments, so the number in an answer is the
number on the screen, and add no arithmetic of their own. A figure is an
ordinary item of type `figure` with the id `figure:<what>:<period>[:<detail>]`
(docs/domain.md, Computed figure, has the list); an unknown is omitted, never
zero. `lib/answer.js` checks a citation's id by shape first (`isCitationId`: a
record reference, `profile` or a figure id) and then by membership in what was
sent, which stays the real check; the prompt lets a total, difference,
average, rate or comparison be stated only by citing a figure.

**The size budget** (#175, ADR 0028). The context is measured on what is sent:
`serializeContext(context)` (`serialize.js`) returns the exact JSON placed in
the `<context>` block -- items reduced to `{ id, type, label, content,
labels }`, `<` escaped, plus today, the week, the timezone, `trackedSince` and
`summarised` -- and `lib/answer.js` builds its block from the same call, so
the measure cannot drift from what the model reads. `buildContext` hands the
whole context to `fitToBudget` (`budget.js`, pure). Within
`limits.contextMaxChars`, nothing changes. Over it, the transaction items of
a month are replaced by that month's figures (which are already items),
oldest month first, re-measuring after each, stopping as soon as it fits;
the newest `limits.contextRecentMonths` months holding transactions up to today, and any
month with no monthly figure (`flowMonths`: before "tracked since"), are never
summarised. `summarised` says `{ before }`, the first month listed in
full after the summarised ones -- plus `since` when older months (before
"tracked since") stay whole, so it never claims more than was summarised. Still over: `tooLarge`, nothing else is cut, and `answerQuestion`
returns `too-large` without calling the model (after `no-model`, which comes
first). The route passes `summarised` on an answer and a not-in-data, and
answers `too-large` with a 200; nothing is written.

`opens` (#173) is where a citation of the item goes: a site-relative address,
or `null` when the record has no screen of its own and the panel expands its
`content` in place. It is decided here, from the record, and **never reaches
the model**: `serializeContext` strips it from the JSON the model sees, so the
model cannot invent or alter an address, and `lib/answer.js` copies it onto a
citation from the context, not from the reply. Each address is spelled once in
`lib/domain/addresses.js` (pure; the screens' own link builders delegate to
it), so a citation can only open what its screen would open. The client still
follows only a plain site-relative address (`components/answerCitations.js`).

The route is `POST /api/questions`: it validates the question
(`limits.questionMaxChars`), builds the context, and hands both to
`lib/answer.js`, which asks the model through one forced tool and checks what
comes back. It writes nothing. Loading a page never reaches it (rule 3).

The rule the layer exists to establish: **no feature builds its own prompt.**
A feature asks for context and passes it to a prompt module. Without that,
every new card invents its own retrieval and its own token budget, and
changing what the AI knows means editing fifteen files.

## Planned, not built

**Demo mode.** `PERSONALOS_MODE=demo` pointing `DATA_DIR` at a read-only demo
dataset with integrations disabled, so the difference between a demo and a
personal install is an environment variable, never a code change.

## What is intentionally simple

- **One JSON document, rewritten whole on every change.** A single person
  generates a few thousand rows a year. A file you can open and read with your
  own eyes is worth more than query power you will not use.
- **A write queue rather than optimistic locking.** Two requests in one
  Next.js process overlap easily — the capture bar saving while a card
  refreshes — so the JSON adapter serialises every read-modify-write on one
  promise chain and gives each temporary file a unique name. Within a process
  that is enough. Across two processes it is not, and neither would a lock
  file be worth its failure modes: the day you write from a phone and a laptop
  at once is the day to move to a database. See
  [0011](decisions/0011-writes-are-serialised-in-process.md).
- **An in-memory link scan rather than an index.** At this volume a filter
  over an array is instant. When it stops being instant, the adapter builds a
  map on read; nothing above it changes.
- **Positions rewritten per band on reorder.** Smarter schemes exist for not
  rewriting thousands of rows. You have a few dozen.

## What must stay replaceable

The storage adapter, the model provider, the capture surface, and every
integration. Each has an ADR explaining what moving it costs.
