# 06 — Date helpers can be imported from a client component

**Status:** resolved 2026-09-05.

**Blocked by** 01. Blocks the mockup port.

## Why

The date module reaches the environment module, which throws by design when
loaded in a browser. So the one function allowed to answer "what day is it"
cannot be called from any interactive component.

The next work in the roadmap is exactly that: ticking a habit, dragging a
card, the capture bar. The first `'use client'` that needs today's date hits
this wall, and the natural reaction is to compute the day inline from an ISO
string — which is the precise trap ADR-0005 exists to prevent. The error
message does not point anywhere useful either.

Doing this after the port means rewriting components.

## What done looks like

- A test imports the date helpers with a browser-like global present and they
  work.
- Pure calendar arithmetic has no dependency on configuration at all.
- The function that needs the user's zone still gets it by default on the
  server, and can be given one explicitly elsewhere.
- No new way of computing a day key appears anywhere. ADR-0005 still holds and
  should be re-read before starting.

## Notes

An injected default parameter is likely enough. Splitting pure arithmetic from
the zone-aware entry point is the other option. Either is fine; a second
implementation of "today" is not.

## Outcome

Took the injected-default option. `lib/domain/dates.js` no longer imports
`lib/config/env.js` at all — the dependency runs the other way now.
`lib/config/env.js` calls a new `setDefaultTimezone()` once, at import time,
after it resolves `env.timezone`. `today()` and `toDayKey()` still default to
that value when called with no timezone; called with none configured (which
only happens if `env.js` was never imported on that path, or the caller is a
client component), they throw a clear error instead of falling through to
`Intl`'s local-zone default — which would have quietly reintroduced the exact
bug ADR-0005 exists to prevent.

The default is held on `globalThis` behind a well-known `Symbol.for(...)`, not
a module variable, for the same reason as the write queue in ADR-0011:
Next.js gives the rsc, ssr and route layers their own instance of a server
module.

Only three call sites relied on the implicit default with no argument
(`app/api/health/route.js`, `components/TodayCard.js`,
`components/SessionCard.js`) — all three are server components today, so the
bug was latent rather than live; it would have hit the first `'use client'`
card that needed a date, per the ticket's premise. No such component exists
yet, so nothing else changed.

`docs/architecture.md`'s layer table and rule list are updated to describe
the reversed dependency. `npm run verify` green on all four stages, 137 tests
(4 new, covering: pure arithmetic and `toDayKey` under a stubbed `window`, and
`today()` both throwing with no default configured and picking up the one
`env.js` sets).
