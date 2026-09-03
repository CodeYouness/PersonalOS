# 0011. Writes are serialised in process, by a queue

- **Status** accepted
- **Date** 2026-09-03

## Context

Every mutation in the JSON adapter is a read-modify-write of the whole
document: `updateState` reads the file, mutates the object, writes it back.
Nothing serialised those three steps, and the temporary file the write renamed
into place was named after the process id — the same name for every write in
the process.

Two overlapping writes therefore did one of two things. Either the second read
happened before the first write landed, and the first write was silently
overwritten by a document that never contained it; or the two renames raced and
one of them threw `ENOENT` on a path the other had already moved away.

This is not a theoretical concurrency puzzle. One Next.js process serves
overlapping requests routinely — the capture bar saving while a card refreshes
is enough. It breaks the rule that capture never fails, which is the promise
the rest of the system is built on.

## Decision

**Serialise every read-modify-write in the process on a single promise chain,
and give each temporary file a name unique per write.**

The queue is a few lines in `lib/adapters/json/file.js`: a `tail` promise, and
an `enqueue` that chains work onto it and keeps the chain moving whether the
work succeeded or failed. `updateState`, `resetState` and `readState` all go
through it.

Reads are in the queue because a read can write: `readState` creates the
document from the seed when it is missing, and rewrites it when a migration is
due. Left outside, that write could land on top of a mutation already saved —
on a fresh install, one page load racing one capture. Serialising reads on a
single-user JSON document costs nothing worth measuring, and it is one rule
instead of two. `updateState` calls an inner `loadState` so that it does not
queue behind itself.

The tail of the queue lives on `globalThis` under a `Symbol.for`, not in a
module variable. Next.js gives the rsc, ssr and route layers their own instance
of a server module, and `next dev` replaces them on every edit; a queue in a
module variable would be one queue per bundle, which serialises nothing. For
the same reason the temporary file is named with `randomUUID()` rather than a
counter — a counter is unique only within the instance that owns it.

### Why a queue rather than a lock file

A lock file protects against a second *process*. That is a real scenario one
day — a phone and a laptop writing the same document — but a lock file solves
it badly: it needs a stale-lock timeout, and every timeout is a number that is
wrong on somebody's machine. It can be left behind by a crash, and then the
app is locked out of its own data with no way back but a manual delete.

The failure that exists today is inside one process, and a promise chain
closes it completely, with nothing to acquire, nothing to release, and no path
that can leave the document locked. The multi-process case is the same case
already named in `docs/architecture.md` as the day to move to a database, and
a database's transactions solve it properly.

## Consequences

- Writes to the working document are ordered. Concurrent callers of the store
  each see the previous write.
- Writes no longer run in parallel. On a single-user JSON document each write
  is a file read plus a file write of a few hundred kilobytes; the queue costs
  nothing worth measuring. If the document ever grows enough for that to
  matter, the answer is a database, not a finer-grained lock.
- A failed write rejects for its own caller and does not stall the queue, and
  its temporary file is removed rather than left behind as a full copy of the
  document.
- Two processes writing the same file are still unprotected, and deliberately
  so. Nothing here should be extended into a general-purpose lock.
- Check-then-act above the adapter is not covered by this. Two concurrent
  imports of the same bank line can still both see `upsertTransactionByOrigin`
  find nothing and both create a row, because the read and the write are two
  units of queued work. Making that atomic means restructuring the importer
  path, and it is a separate decision from this one.
- `tests/store/adapter-contract.js` asserts that three concurrent writes all
  survive, so any future adapter inherits the requirement.
