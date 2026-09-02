# Architecture

## The shape of the thing

PersonalOS is not eight cards with a database behind them. It is one repeated
gesture -- you say something -- and everything else is consequence.

```
   text (capture bar, voice, later Telegram)
        |
        v
   classify()  ->  { destination, title, person, urgency }
        |          model first, keyword rules underneath, never fails
        v
   lib/store.js  ->  writes in three places:
        |               the raw capture, a memory entry,
        |               and the card that owns the destination
        v
   cards read the last saved value -- never the model
```

## Layers

| Layer | Where | May depend on |
| --- | --- | --- |
| Screens and routes | `app/` | `lib/store.js`, `lib/domain/`, `personalos.config.js` |
| Data access | `lib/store.js` | the active adapter only |
| Storage adapters | `lib/adapters/` | `lib/domain/`, `lib/config/` |
| Pure domain | `lib/domain/` | `lib/config/` (dates, for the timezone) |
| Configuration | `lib/config/`, `personalos.config.js` | nothing |

Two rules hold this together, and both are enforceable rather than aspirational:

**Nothing reaches storage except through `lib/store.js`.** Not a component, not
a route handler, not a script. When that rule holds, moving from a JSON file to
Postgres is a rewrite of one adapter. When it leaks into twenty components, the
same move is a weekend.

**`lib/` runs under plain Node.** Relative imports only, no `@/` alias, no
bundler assumptions. The `@/` alias belongs to `app/` and `components/`. This
is what lets a one-off migration or backup script reuse the real data layer
instead of reimplementing it.

## The adapter contract

`lib/adapters/contract.js` lists the operations a storage adapter must provide,
in the language of the domain: `getTasks`, `createTask`, `getDailyLog`. Never
`readJSON` or `writeJSON`. If you find yourself wanting to export the raw
document from `lib/store.js`, that is the signal that a domain operation is
missing, not that the rule is inconvenient.

`tests/store/adapter-contract.js` is a suite parameterised by adapter. The
JSON adapter runs it today. When a database adapter arrives it runs the same
file, and the result is a direct answer to "is it equivalent?" rather than a
hope. That is the whole reason the contract is a file and not a comment.

## Data flow, concretely

- A **read** in a screen: server component or route handler calls
  `lib/store.js`, which calls the adapter, which reads the document.
- A **write** from the UI: the screen updates optimistically, posts to its
  route, the route calls `lib/store.js`. If the write fails, the screen
  re-reads real state rather than continuing to show something never saved.
- A **capture**: the classify function decides a destination, and the same
  request writes the raw capture, a memory entry, and whatever the destination
  owns. All three through the store.

## Extension points

- **Storage.** Add `lib/adapters/<name>/`, implement the contract, run the
  suite, switch the adapter in `lib/store.js`.
- **Destinations.** `DESTINATIONS` in `personalos.config.js`. The classifier is
  validated against it; a destination the model invents is rejected.
- **Model provider.** Isolated behind the classify and answer modules, so a
  different provider or a local model is a swap, not a refactor.
- **Cards.** Each owns a screen section and its own API route. A card never
  reaches into another card's data; it reads through the store.

## What is intentionally simple

- **One JSON document, rewritten whole on every change.** A single person
  generates a few thousand rows a year. The complexity of partial writes buys
  nothing here, and a file you can open and read with your own eyes is worth
  more than query power you will not use.
- **No optimistic locking.** One writer, one machine. This stops being true the
  day you write from a phone and a laptop at once, which is exactly the day the
  guide says to move to a database.
- **Positions rewritten per band on reorder.** Smarter schemes exist for not
  rewriting thousands of rows. You have a few dozen.
- **No dependency injection container.** `lib/store.js` picks one adapter with
  one assignment.

## What must stay replaceable

The storage adapter, the model provider, and the capture surface. Everything
else may be rewritten freely; these three are the axes the project is expected
to move along, and each one has an ADR explaining what it costs to move it.
