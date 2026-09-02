# Roadmap

What exists, what comes next, and in which order. Update the status column in
the same commit that changes it.

The order is not arbitrary. Capture is built before the cards because
everything else reads what capture writes, and the cards go from easiest to
hardest so that each finished one is usable the same evening.

## Done

| # | Piece | Where |
| --- | --- | --- |
| 0 | Project scaffold, conventions, `npm run verify`, CI | root |
| 1 | Product configuration and environment access | `personalos.config.js`, `lib/config/` |
| 2 | Date primitive in the user's timezone, stable ids | `lib/domain/` |
| 3 | Data layer, adapter contract, JSON adapter, seed | `lib/store.js`, `lib/adapters/`, `data/` |
| 4 | Bootstrap shell and health route | `app/` |

## Next

| # | Piece | Notes |
| --- | --- | --- |
| 5 | **Mockup** | One self-contained HTML file, colours as CSS variables at the top, a section per card with a speaking id. Decide the look *before* writing components -- deciding after means writing them twice. |
| 6 | **Port the mockup** | Into `components/`: top bar, grid container, one component per screen. CSS moved as is into `app/globals.css`. Hard-coded data for now. |
| 7 | **Classifier** | `lib/classify.js`. Text in, `{ destination, title, person, urgency }` out. Model first, keyword rules underneath, and it records which one answered. No extended thinking here -- it adds seconds to the one gesture you repeat all day. |
| 8 | **Capture route** | Writes the capture, a memory entry, and whatever the destination owns. |
| 9 | **Capture bar** | Fixed at the bottom, four states, browser speech recognition on the mic. |
| 10 | **Cards, one per commit** | Operator + Session, Calendar, Habits, CRM (structure, then natural-language search), Nutrition, Health, Goals, Finance. Each is its own commit. |
| 11 | **Questions route** | Passes the whole context to the model and requires every claim to cite its source. |
| 12 | **The bar answers questions** | A question mark or an interrogative opening routes to the answer endpoint instead of filing. |

## Not yet, and deliberately so

**Going online.** A public URL means a real database, a password gate in front
of everything, and secrets in a hosting panel. The moment a deploy finishes,
your net worth has a public address, so the gate is built before the deploy and
not after. Related: Telegram capture, embeddings-based memory, the morning
briefing, the automatic backup. All of it is gated on that decision, and all of
it is flagged off in `personalos.config.js`.

**Overview screens** -- Blocks, the Finances screen, the weekly Review. They
are recombinations of the eight cards and introduce nothing new, so they land
once the data underneath is real and you know what you want to see.

## Working from the guide's prompts

The guide's build prompts assume a freshly created, otherwise empty project.
This repository has a little more structure, so before pasting one, check:

- Data goes through `lib/store.js`. A prompt that says "read the JSON file"
  means "add a store function".
- Destinations, bands, temperatures and limits come from
  `personalos.config.js`, never inline.
- "Today" comes from `lib/domain/dates.js`.
- `lib/` uses relative imports; `app/` may use `@/`.
- One card, one commit, and `npm run verify` before calling it done.
