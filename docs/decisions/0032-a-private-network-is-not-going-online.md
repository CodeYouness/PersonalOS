# 0032. A private network is not going online

- **Status** accepted
- **Date** 2026-11-09

## Context

Spec #221 makes the phone a second capture surface: the iPhone's Action Button
files a sentence through the same route, classifier and capture log as the
capture bar. The phone has to reach the Mac, and the Mac has to be up.

Two facts about today's setup stand in the way. `next dev` and `next start`
listen on every interface (`0.0.0.0`) by default, so on a shared Wi-Fi anyone
on the network reaches every screen and every write route. And the app runs as
`next dev` started by hand: a second one is a second writer, the lost-write bug
ADR 0011 closed.

Deploying would solve reach and uptime, and raise the question the roadmap
already answers: a public URL means a real database, a password gate, and a net
worth with a public address. That is not what this needs.

## Decision

A private network, not a deploy.

- **Tailscale, with `tailscale serve`.** The phone reaches the Mac over the
  tailnet, which only the owner's devices join. `tailscale serve` proxies to
  the local port; `tailscale funnel` (public) is never used.
- **Only the capture and journal paths are exposed** through the proxy. The
  rest of the app is not reachable from the phone.
- **A token on proxied requests.** The tailnet is the first gate, the token the
  second, so a device that joins the tailnet later does not file captures.
  The token is `PERSONALOS_PHONE_TOKEN`, read only in `lib/config/env.js`. The
  check is one helper, `lib/phone-gate.js`, called first in the capture route
  and the journal handlers, not in Next's request proxy: a request is
  *proxied* when it carries a header `tailscale serve` adds (`Tailscale-User-*`,
  `X-Forwarded-For`); a proxied request without the right token gets 401 and
  writes nothing, compared in constant time; with no token configured every
  proxied request is refused. A request without those headers is the Mac's own
  browser and needs none -- only a process on the Mac can forge the headers,
  and it can already read the data file. The journal path is a prefix, so the
  handlers under it use the gate too. Setup is in `docs/development.md`.
- **Every server mode listens on `127.0.0.1`.** `serve`, `dev` and
  `dev:sandbox` pass `-H 127.0.0.1`. Only the Mac, and the local Tailscale
  proxy, reach the port; the Wi-Fi does not.
- **`npm run serve` is the one writer.** A production build, then `next start`,
  on the real data. It takes a lock on the data directory
  (`lib/writer-lock.js`, a `serve.lock` file holding its pid). `npm run dev`
  refuses to start while a live process holds it, naming the process and how to
  stop it. A lock whose owner is gone is stale and is taken over, so a crash
  never locks anyone out. The sandbox works on its own copy of the data and
  neither takes nor checks the lock.

ADR 0011 still holds: one process, one host. The roadmap's "password gate
before any deploy" still stands; this is not a deploy.

## Consequences

- Code changes reach `serve` only when it is rebuilt. `dev` is for work on the
  code, with `serve` stopped.
- Scripts that write the real data (the sheet import) run with `serve` stopped,
  and `dev` if it is running. They do not take the lock.
- The lock is advisory: it keeps the two servers apart, not a script or an
  editor. A pid reused by an unrelated process after a crash would read as a
  live holder; the message names the process so it can be told apart.

## What reopens it

A public URL, a second writer, or a host I do not own.
