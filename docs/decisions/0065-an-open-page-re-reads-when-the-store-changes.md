# 0065. An open page re-reads when the store changes

- **Status** accepted
- **Date** 2026-11-21

## Context

Spec #285 adds writers that are not the page in front of me: a scheduled sync,
a capture from the phone, a Telegram message. A page left open shows what was
true when it loaded. Rule 3 says loading a page never calls the model or an
integration, so whatever refreshes it must only re-read saved values.

## Decision

- **The store announces, with no data.** `lib/changes.js` holds a set of
  listeners on `globalThis` (Next bundles server code more than once, like the
  write queue). The JSON adapter calls `announceChange()` at the end of
  `writeState`, after the atomic rename, so a failed write announces nothing.
  `lib/store.js` re-exports `onStoreChange`.
- **A gated route streams it.** `GET /api/changes` is a server-sent event
  stream: one `change` event with an empty body per signal, a keep-alive comment
  every 25 s, `retry: 3000`. It calls `refuseUnlessAllowed` first like every
  route a proxy may reach (ADR 0032), and removes its listener when the client
  goes away.
- **The page refreshes its server data.** `components/LiveUpdates.js`, in the
  root layout, opens an `EventSource` and calls `router.refresh()` on a signal.
  A refresh merges the new server payload and keeps client state, so text
  half-typed in a field survives. Bursts are coalesced (250 ms) into one
  refresh. The browser reconnects by itself after a drop; the first open after
  an error refreshes once, since anything may have happened meanwhile. The
  first connection does not refresh.

## Consequences

- An update reads saved values only: no model, no integration.
- The signal fires for every write, including the page's own. The refresh after
  one's own edit is redundant but harmless.
- The stream is per process: it hears writes of the process it runs in, which
  is the one writer (ADR 0011). A script writing the file with `serve` stopped
  is not heard; nothing is open then.
