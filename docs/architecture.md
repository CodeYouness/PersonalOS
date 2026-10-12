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
| Screens and routes | `app/` | `lib/store.js`, `lib/domain/`, `lib/domain/derive/`, config |
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

## Extension points

- **Storage.** Add `lib/adapters/<name>/`, implement the contract, run the
  suite, switch the adapter in `lib/store.js`.
- **Relations.** Add a `rel` to `LINK_RELS` and document it in `domain.md`.
- **Destinations.** `DESTINATIONS` in `personalos.config.js`.
- **Integrations.** Implement the contract, register it, flag it in config.
- **Model provider.** Isolated behind classify, extract and answer modules.
- **Cards.** Each owns a screen section and its own API route, and never
  reaches into another card's data.

## The AI context layer

`lib/ai/context/` (#172, ADR 0028) is what the model is allowed to know when
it answers. It is built for questions first; the classifier and extraction
keep their own prompts until they move. One entry point:

```
buildContext('question') -> { today, week: { from, to }, timezone, trackedSince, items }
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

`opens` (#173) is where a citation of the item goes: a site-relative address,
or `null` when the record has no screen of its own and the panel expands its
`content` in place. It is decided here, from the record, and **never reaches
the model**: `contextBlock` (in `lib/answer.js`) strips it from the JSON the model sees, so the
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
changing what the AI knows means editing fifteen files. Still to come: the
token budget and summarising (#175).

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
