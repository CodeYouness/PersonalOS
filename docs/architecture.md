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
| Screens and routes | `app/` | `lib/store.js`, `lib/domain/`, config |
| Data access | `lib/store.js` | the active adapter only |
| Storage adapters | `lib/adapters/` | `lib/domain/`, `lib/config/` |
| Derivations | `lib/domain/derive/` | `lib/domain/` only — pure functions |
| Pure domain | `lib/domain/` | `lib/config/` (dates, for the timezone) |
| Integrations | `lib/integrations/` | `lib/store.js`, `lib/domain/` |
| Configuration | `lib/config/`, `personalos.config.js` | nothing |

Four rules hold this together, and each is enforceable rather than
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

## The graph

Relations are their own collection (ADR 0006). Every id carries its entity
type as a prefix, so a reference is a self-describing string, and
`lib/domain/refs.js` validates one at the boundary.

Reading a relation is a join, so the store exposes named domain operations —
`getTasksForPerson`, `getTasksForGoal`, `getMemoryOrigin`, plus the generic
`getRelated` / `getReferrers`. A component asks for the tasks of a person; it
never asks for links with rel `involves`.

## The adapter contract

`lib/adapters/contract.js` lists the 52 operations an adapter must provide, in
the language of the domain. `tests/store/adapter-contract.js` is a suite
parameterised by adapter: the JSON one runs it today, and a database one will
run the same file. That is why the contract is a file and not a comment.

## Schema versions

The document carries `schemaVersion`. `lib/adapters/json/migrations.js` is a
pure function from an old shape to the current one — pure so it can be tested
without a disk, idempotent because every read of an old file calls it. The
caller copies the file aside before rewriting it.

The seed is versioned with the code and must never be behind it; `readSeed`
throws if it is.

## Data flow, concretely

- A **read** in a screen: server component or route handler calls
  `lib/store.js`, then a function from `derive/` if a number is involved.
- A **write** from the UI: the screen updates optimistically, posts to its
  route, the route calls the store. On failure it re-reads real state rather
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
- **Model provider.** Isolated behind classify and answer modules.
- **Cards.** Each owns a screen section and its own API route, and never
  reaches into another card's data.

## Planned, not built

**AI context layer.** A future `lib/ai/context/` with one entry point:

```
buildContext(intent, options) -> { profile, entities, memories, events, journal }
```

The rule it exists to establish: **no feature builds its own prompt.** A
feature asks for context and passes it to a prompt module. Without that, every
new card invents its own retrieval and its own token budget, and changing what
the AI knows means editing fifteen files.

**Demo mode.** `PERSONALOS_MODE=demo` pointing `DATA_DIR` at a read-only demo
dataset with integrations disabled, so the difference between a demo and a
personal install is an environment variable, never a code change.

## What is intentionally simple

- **One JSON document, rewritten whole on every change.** A single person
  generates a few thousand rows a year. A file you can open and read with your
  own eyes is worth more than query power you will not use.
- **No optimistic locking.** One writer, one machine. That stops being true
  the day you write from a phone and a laptop at once — which is exactly the
  day to move to a database.
- **An in-memory link scan rather than an index.** At this volume a filter
  over an array is instant. When it stops being instant, the adapter builds a
  map on read; nothing above it changes.
- **Positions rewritten per band on reorder.** Smarter schemes exist for not
  rewriting thousands of rows. You have a few dozen.

## What must stay replaceable

The storage adapter, the model provider, the capture surface, and every
integration. Each has an ADR explaining what moving it costs.
