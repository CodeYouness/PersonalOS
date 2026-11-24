# 0067. `serve` always stops when it is told to

- **Status** accepted
- **Date** 2026-11-24

## Context

`npm run serve` is the one writer (ADR 0032): it holds the lock on the data
directory and runs `next start`. Told to stop, it passed the signal on and
waited for the server to exit.

`next start` takes SIGTERM, closes its port, and waits for its open
connections. A page left open holds a live-updates stream (ADR 0065) that
never ends, so the server never exits. Reproduced on the seed: with no
stream open it exits in a second; with one open it is still there after
fifteen, listening on nothing.

On 2026-11-23 that met `launchctl kickstart -k`. launchd asked, waited its
20 seconds, and killed the `npm` it had started. `serve` was left behind with
no parent, still waiting, still holding the lock, its server still answering
with the old build; every start launchd tried refused with "already
running". Stopping it by hand closed the port and still did not end the
server: the app was down until the server was killed.

A second thing made it worse: the server was started through `npx`, so
`serve`'s child was a wrapper. Killing the child would have left the server
itself behind.

## Decision

- **`serve` stops its server within a grace.** On SIGTERM or SIGINT it asks
  the server with the same signal and kills it (SIGKILL) when it has not
  gone after `limits.serveStopGraceMs` (5 s), then releases the lock and
  exits (`scripts/stop-child.js`). It says so on stderr when it had to kill.
- **The grace is shorter than launchd's**, which is 20 s by default: `serve`
  must be done before launchd gives up on it, or nothing is left to release
  the lock.
- **The server is started as `node next`**, not through `npx`: the signal and
  the kill reach the server process.
- **The streams are not closed on the way out.** That would let the server
  go by itself, but it is a second mechanism for the same end, inside a
  shutdown Next owns. The kill covers every reason a server might not go;
  closing streams covers one.

## Consequences

- A restart costs at most the grace plus the build, whether or not a page is
  open.
- A kill can cut a request short. The server stopped accepting new ones at
  the signal, a request has the whole grace to finish, and a write is a
  temporary file renamed over the document (`lib/adapters/json/file.js`), so
  a cut write leaves the last whole document, not half of one.
- A scheduled job running at the kill is cut too, and its run is not
  recorded; the slot stays owed and the next start runs it (ADR 0062).
- An open page loses its stream and reconnects on its own (ADR 0065).
- A `serve` already orphaned by an older build is not fixed by this: it has
  to be stopped once by hand.
