# 0063. Every run is recorded

- **Status** accepted
- **Date** 2026-11-21

## Context

Work that runs unattended needs an answer to "did it run, how long did it
take, what did it write, why did it fail". `SyncState` holds only the last
state of one integration and is overwritten each time. A schedule that was
skipped because nothing was configured must not look like one that never
tried, and a model run's cost must be computable later without having been
guessed at the time.

## Decision

- **A run is a record in its own collection** behind the store (`runs`,
  schema 26, added empty by the migration): the schedule, who started it
  (`schedule`, `user`, `telegram`), the engine, when it started, how long it
  took, the outcome (`ok`, `failed`, `skipped`), a reason or error, what it
  wrote as counts by kind, and for a model run the model and the input and
  output token counts.
- **It is written once, when the run ends, and never edited.** A run that
  never ended (the process died) leaves no record and is owed again on the
  next start (ADR 0062).
- **Closed vocabularies are checked at the store boundary** (`recordRun`):
  schedule id, starter, engine, outcome, and every kind in `wrote`
  (`RUN_WRITE_KINDS`, which a ticket whose job writes a new kind extends). A
  field the run does not have -- a cost in money -- is refused, not dropped.
- **Cost in money is never stored.** It is derived from the tokens and a
  price, so a changed price never rewrites history.
- **A failed run keeps its error; a skipped one keeps its reason.** One
  `reason` field holds both. A job may report an expected failure with a
  short code (`needs-login`) instead of throwing.
- **Kept 90 days** (`limits.runRetentionDays`). The `prune-runs` schedule
  removes older runs nightly through `removeRunsBefore`; it is the one
  schedule that ships with the scheduler.
- **`SyncState` stays as it is.** The manual scripts write it and the
  staleness line reads it; folding it into the run log is out of scope.

## Consequences

- The run log page (`/manage/runs`, #289) reads saved values only: the last run of
  each schedule on top, the list below. Opening it starts nothing.
- "Last run of a schedule" is the one input to "is it due"; the log is thus
  load-bearing for the scheduler, not only a report. Pruning at 90 days can
  never remove the last run of a monthly-or-faster schedule.
- The log grows by a few rows a day and is bounded by the prune.
