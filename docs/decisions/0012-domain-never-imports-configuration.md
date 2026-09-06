# 0012. `lib/domain/` never imports configuration

- **Status** accepted
- **Date** 2026-09-05

## Context

`lib/domain/dates.js` imported `lib/config/env.js` for one reason: to default
the `timezone` parameter of `today()`/`toDayKey()` to the configured zone.
`env.js` throws by design when loaded from a browser — it is server-only, and
it also carries secrets (the Anthropic API key, the calendar iCal URL).

A static import runs a module's top-level code regardless of which export is
actually used. So importing anything from `dates.js` — including its pure
calendar arithmetic (`shiftDayKey`, `isDayKey`, `dayKeyRange`,
`dayKeysEndingAt`), which never touches configuration — dragged in `env.js`'s
browser guard and threw. The one function allowed to answer "what day is it"
could not be called from any interactive component.

This was latent rather than live: nothing client-side needed a date yet. But
the next roadmap work is exactly that — ticking a habit, dragging a card —
and the natural workaround under deadline is computing a day key inline from
an ISO string, which is the precise trap ADR-0005 exists to prevent.

## Decision

**Reverse the dependency. `lib/domain/` never imports configuration.**

`lib/config/env.js` calls a new `setDefaultTimezone()` once, at import time,
right after resolving and validating `env.timezone` — handing `dates.js` the
value it needs, rather than `dates.js` reaching for it.

`today()` and `toDayKey()` still default to that value when called with no
explicit timezone. If none has been configured yet — which only happens if
`env.js` was never imported on that path, or the caller is a client component
— they throw a clear error rather than falling through to `Intl`'s local-zone
default. Silently resolving to the machine's zone is the exact failure mode
ADR-0005 exists to prevent; a loud error here is strictly safer than the
alternative.

The default is held on `globalThis` behind a well-known `Symbol.for(...)`,
not a module-level variable, for the same reason as the write queue in
ADR-0011: Next.js gives the rsc, ssr and route layers their own instance of a
server module, so a module-level value would be one default per bundle
instead of one for the process.

## Consequences

- `lib/domain/` can be imported from anywhere, including a client component,
  with no risk of pulling configuration — or the secrets `env.js` carries —
  into a browser bundle.
- Every existing server caller of `today()`/`toDayKey()` with no argument
  keeps working unchanged: whatever path reaches them already transitively
  imports `lib/config/env.js` first. Traced for all three current call sites
  (`app/api/health/route.js`, `components/TodayCard.js`,
  `components/SessionCard.js`) — none is a client component yet, so the bug
  this closes has not shipped, but the next one built on a date would have
  hit it.
- A client component that needs today's date must be given a timezone
  explicitly. There is no way for it to ask this module for the "real"
  configured zone — by design, since that would mean reaching for
  configuration again.
- `docs/architecture.md`'s layer table now reads `lib/domain/` → nothing, and
  `lib/config/` → `lib/domain/` (dates, to inject the timezone). It is the one
  layer dependency in the project that points against the table's usual
  direction, and it does so because `dates.js` must stay safe for a layer
  none of the others need to reach.
