# 0066. A due schedule waits for what it needs

- **Status** accepted
- **Date** 2026-11-23

## Context

The broker sync runs on Monday at 07:00. Its signing key lives in the Secure
Enclave, which cannot be used while the Mac is locked -- and at 07:00 the Mac
is locked. The run failed (2026-11-23), and ADR 0062 counts any run as the
slot's run, so nothing tried again until the next Monday. A schedule that
fails every week by construction is not a schedule.

Three ways out were on the table. Moving the slot to an hour the Mac is
usually in use only makes the failure rarer. Retrying a failed run needs to
know when to retry: every tick writes a failed run a minute all morning, and
calls the broker's CLI each time. Asking the machine first needs neither.

## Decision

- **A schedule may declare `needs`**, one of the closed list `SCHEDULE_NEEDS`
  in `personalos.config.js`. One value so far: `unlocked`, the Mac's screen
  not locked. `sync-scalable` declares it.
- **A due schedule with a need is asked for before it starts.** While the
  machine does not have it, nothing runs and nothing is recorded: the slot
  stays owed by the same derivation as before (`dueSlot`), and the first tick
  that finds the machine ready runs it. No state is added; "waiting" is a
  slot that is due and a need that is not met.
- **The failure does not happen, rather than being retried.** A run that
  never started leaves no failed row, and the run that does happen is
  recorded at the moment of the unlock.
- **`unlocked` is read from `ioreg`'s root entry** (`IOConsoleLocked`), in
  `lib/scheduler/machine.js`, and the scheduler takes the reader as an
  argument (`ready`) like its clock and its store.
- **What cannot be read counts as ready**: no `ioreg`, an entry that does not
  say, a machine that is not a Mac, a reader that throws. The need only ever
  delays a run; it never becomes a reason a schedule silently stops running.
  The job then runs and says for itself what is wrong, as before.
- **`runNow` does not ask.** The button is pressed by someone at the Mac.
- **The run log says what a waiting schedule waits for** in place of its next
  slot ("When the Mac is unlocked"), from `due` in `runLogView` and the
  schedule's `needs`. Reading it calls nothing (rule 3): the page does not
  probe the lock, it reports a slot that is owed.

## Consequences

- A Monday morning costs a delay, not a week: the sync runs within one tick
  (`limits.schedulerTickMs`) of the first unlock.
- A run that fails for another reason, or because the Mac was locked between
  the question and the job, is still the slot's run and is not retried
  (ADR 0062 stands).
- A failed run from before this decision is not picked up again: its slot has
  its run.
- A Mac that stays locked for a week owes one run, not two (`once`).
- A new need is a value in `SCHEDULE_NEEDS`, a branch in
  `isMachineReady` and a line in the run log's words.
