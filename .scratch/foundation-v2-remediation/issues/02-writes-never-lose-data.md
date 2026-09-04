# 02 — Concurrent writes neither crash nor lose data

**Status:** resolved 2026-09-03.

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

## Outcome

Two tests in the shared contract suite first, and both failed on the real bug:
`ENOENT` on rename, from two writes racing for the same `.pid.tmp` path.

The fix is in `lib/adapters/json/file.js`. The temporary file is named with a
uuid rather than the process id, and `updateState`, `resetState` and
`readState` all run through `enqueue`, a promise chain whose tail is held on
`globalThis` — Next.js gives the rsc, ssr and route layers their own instance
of a server module, so a module-level queue would be one queue per bundle.
Reads are in the queue because `readState` writes: it creates the document
from the seed and it runs migrations, and either landing outside the queue
could overwrite a mutation already saved. `updateState` calls an inner
`loadState` so it does not queue behind itself.

With uuid temp names but the chain removed, the first test reports 4 tasks
where it expects 6 — so the test pins the queue and not just the rename.

`npm run verify` green on all four stages, **98 tests in 7 files** (96 before).
`npm run check:secrets` passes, 85 tracked files.

`docs/architecture.md` no longer says the single-writer assumption only breaks
across two machines, and ADR
[0011](../../../docs/decisions/0011-writes-are-serialised-in-process.md)
records why a queue and not a lock file.

Left open, deliberately, and both recorded in 0011:

- Two processes writing the same file. That is the case the architecture
  already names as the day to move to a database.
- `upsertTransactionByOrigin` reads in one queued unit and writes in another,
  so two concurrent imports of the same bank line can both create a row.
  Making it atomic means restructuring `createTransaction`, which is a
  separate decision from this ticket.
