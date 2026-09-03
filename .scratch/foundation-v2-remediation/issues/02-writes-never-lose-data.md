# 02 — Concurrent writes neither crash nor lose data

**Blocked by** 01.

## Why

Every write is a read-modify-write with no serialisation, through a temporary
file named after the process id — the same name for every concurrent write in
the same process. Two overlapping writes either lose one silently or fail on
rename.

This is reachable with two overlapping HTTP requests in one Next.js process:
the capture bar saving while a card refreshes. It violates the rule that
capture never fails, which is the promise the whole system rests on.

## What done looks like

- A test that starts three writes concurrently and asserts all three survive.
  Write it first and watch it fail; a fix with no failing test before it has
  not been demonstrated.
- The same test lives in the shared adapter contract suite, so any future
  adapter inherits it.
- Sequential writes still behave exactly as before.
- `docs/architecture.md` no longer claims the single-writer assumption only
  breaks across two machines. It breaks inside one process, and the document
  should say what the code now does.
- ADR **0011** records the decision, what it costs, and why a queue rather
  than a lock file.

## Notes

The temporary file needs a name unique per write, not per process. The queue
is a single promise chain around read-modify-write; it does not need to be
more than a few lines, and it should not become a general-purpose lock.

Do not reach for a dependency.
