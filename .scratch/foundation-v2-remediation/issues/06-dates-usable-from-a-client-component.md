# 06 — Date helpers can be imported from a client component

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
