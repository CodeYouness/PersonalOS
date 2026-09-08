# 0014. The calendar syncs in, not out; an appointment's own data survives it disappearing

- **Status** accepted
- **Date** 2026-09-08

## Context

The original guide (`PersonalOS.md`, §5.2 · Calendario) designs the Calendar
card as a request-time API route: fetch the account's iCal feed, parse it,
expand recurrence over a 14-day window, cache the result in memory for five
minutes. That predates ADR 0010, and it is exactly the shape ADR 0010 already
rules out for every integration — "a calendar" is named there by name as one
that will follow the same rule as the rest.

Building the card is also the point where a question shows up that ADR 0009's
transaction import never had to answer. A bank transaction, once it lands in
an export, does not un-happen. An appointment does: the source calendar can
cancel or move it between two syncs. If a sync just upserts whatever the
current feed says and calls it done, a meeting the user had already annotated
— a note, a link to a person — disappears from PersonalOS along with what
they wrote, the moment it is cancelled upstream.

## Decision

The calendar integration is `kind: 'calendar'` in
`lib/integrations/contract.js`'s existing `INTEGRATION_KINDS`, invoked by a
manual script (`npm run sync:calendar`), never by a request handler. The
guide's live-fetch-with-cache design is superseded for this feature; a reader
implementing §5.2 literally is implementing the wrong thing.

`Appointment` (docs/domain.md) extends ADR 0009's two-zone ownership split to
a new case:

| Owned by the source | Owned by you |
| --- | --- |
| title, date, startTime, endTime, calendarLabel | note, links |

Matching is by `externalId` — the iCal `UID`, plus the occurrence's `date` for
a recurring series — the same idempotent-re-run posture
`upsertTransactionByOrigin` uses.

**When a previously-synced appointment's `externalId` is absent from a fresh
sync**, it is deleted — unless it carries a user-owned `note` or `link`, in
which case it is kept and marked as no longer confirmed by the source, rather
than silently disappearing along with what the user wrote about it.

All-day and multi-day events are skipped on sync, logged, not forced into
`date` + `startTime`.

## Consequences

- The Calendar card never adds render latency and never holds the iCal URL —
  only the sync script does, matching ADR 0010's credential posture.
- A cancelled meeting the user never touched simply disappears, as it should.
- A cancelled meeting the user annotated stays visible, flagged — the same
  "the original is never lost" posture the domain already keeps for captures
  and journal entries, applied here to protect a user's own note rather than
  an entire record.
- A future sync implementation that hard-deletes on every vanished
  `externalId` regardless of ownership is the bug this decision exists to
  prevent — same shape as the warning in ADR 0009.
