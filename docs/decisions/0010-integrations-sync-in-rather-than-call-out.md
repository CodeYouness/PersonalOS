# 0010. Integrations sync in; the app never calls out

- **Status** accepted
- **Date** 2026-09-02

## Context

The first planned integration is a broker's MCP server, for portfolio data.
Others will follow — a calendar, a bank export, a health provider.

The obvious design is for the dashboard to call the integration when it needs
data. It is also wrong here, for three separate reasons.

**An MCP server is a tool for an agent, not a library for a web app.** Using
one from a Next.js route means embedding an MCP client, handling its auth, and
keeping a server reachable from wherever the app runs.

**The app would hold the credentials.** The broker's integration can place
orders. A dashboard that will eventually sit behind a password on a public
address must never hold a credential capable of moving money.

**It breaks the rule the whole project is built on.** Loading a page must not
do expensive work. Cards read the last saved value; that is what keeps the
system cheap and fast.

## Decision

Integrations **write records; they are never called during a render.**

```
Integration -> Provider -> domain records -> lib/store.js -> cards read them
```

A sync runs separately — a script, a scheduled job, or an agent session — and
writes through the store like anything else. The cards then read the last
saved observation exactly as they read the last saved anything.

`lib/integrations/contract.js` defines `Integration` (name, kind,
isConfigured, sync) and the per-domain provider shapes. `registry.js` lists
the ones that exist; it is **empty**, because an integration that exists
before there is a concrete need is a credential surface with no payoff.

The dependency direction is the rule: integration → domain, never the
reverse. The core does not import a provider's name anywhere.

Every synced record carries `ExternalOrigin`, and `SyncState` records what the
last run did.

## Consequences

- Credentials stay wherever the sync runs, not in the web application.
- Read-only scope is the default posture, and where a provider does not
  separate scopes, the sync approach is the mitigation.
- Data can be stale, so staleness must be visible: `SyncState` feeds a Sources
  view. A net worth that has not synced in nine days but looks current is the
  same lie as a classifier that silently fell back to keyword rules.
- Live data is not possible by design. For a personal system that is the right
  trade; if something ever genuinely needs live data, it gets its own route
  and its own ADR, and it argues against this one explicitly.
