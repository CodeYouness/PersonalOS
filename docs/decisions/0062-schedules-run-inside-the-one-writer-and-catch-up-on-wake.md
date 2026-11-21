# 0062. Schedules run inside the one writer and catch up on wake

- **Status** accepted
- **Date** 2026-11-21

## Context

ADR 0037 says one writer process hosts the scheduler and every channel, and
that with the laptop closed nothing runs. ADR 0032 made `npm run serve` that
writer, and ADR 0011 serialises writes in one process only: a second process
writing the data file loses writes. Today syncs are scripts that need `serve`
stopped, and nothing runs on a clock. A laptop also sleeps: a schedule that
fires only when a timer happens to tick at its minute would silently skip
every night the lid was closed.

## Decision

- **The scheduler lives in the `serve` process.** `instrumentation.js`
  exports Next's `register()`; in the Node runtime it calls
  `startScheduler()` without awaiting it. `startScheduler` starts only when
  `env.schedulerEnabled` -- the variable `scripts/serve.js` sets for the
  `next start` it spawns, and nowhere else -- so `dev`, `dev:sandbox`,
  scripts and Vitest never run a schedule. It runs in the server's module
  graph, so its writes share the in-process queue with every route. The
  parent process `serve` keeps alive is not used: it would be a second writer.
- **Schedules are a closed vocabulary** in `personalos.config.js`
  (`SCHEDULES`): id, time of day, ISO weekdays, engine (`script` or
  `small-model`), catch-up rule (`once` or `same-day`). A schedule and its
  job (`lib/scheduler/jobs.js`) are added together; a test fails when the
  lists disagree. Times are read in `USER_TIMEZONE` through `lib/domain/dates.js`.
- **"Is it due" is derived, never stored** (`lib/domain/derive/schedule.js`):
  the schedule's latest slot that has passed, against the start of its last
  run in the run log (ADR 0063). A slot is a time of day on an allowed day.
  There is no next-run time in the data. `nextSlot` derives one for a page.
- **Catch-up is the same question asked late.** The scheduler wakes on a
  short interval (`limits.schedulerTickMs`) and asks it for each schedule, so
  a machine that slept is just a late tick. Several missed slots owe one run,
  never one per slot. `once` runs late however late; `same-day` runs late
  only while the slot's day is still today and is otherwise dropped (the
  evening reminder, which must never speak of yesterday).
- **Any run counts as the last run**, whether ok, failed or skipped, so a
  failing job is tried once per slot and not every minute. A schedule never
  run is owed its latest slot, which is why a fresh install runs each
  schedule once on its first start.
- **One run per schedule at a time.** A tick that finds a run in flight
  starts nothing for it. A slot already attempted in this process is not
  attempted again even if its run could not be recorded, so a broken disk
  does not become a loop. A job that throws is recorded as failed and the
  loop goes on.
- **The scheduler takes its clock, schedules, jobs and store as arguments**
  (`createScheduler`), so a test drives it with no waiting and no disk.
- **Scheduled work uses scripts and the small model, never the strong
  model.** The engine vocabulary has no third value.

## Consequences

- A closed lid costs a delay, not a day; nothing needs `serve` stopped to run
  a sync once later tickets move them in.
- The scheduler is only as alive as `serve`: with it stopped, or the laptop
  asleep, nothing runs, and the next start catches up once.
- A schedule that is due on every start of a long-unused install runs
  immediately on boot. That is the intended catch-up.
- A job that overruns its tick is not interrupted; it holds only its own
  schedule's slot.
