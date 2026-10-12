# 0029. A habit's schedule and target belong to its period

- **Status** accepted
- **Date** 2026-10-12

## Context

A habit was daily by definition: every active day was a day it was expected.
A habit you keep on some days of the week -- the gym on Monday, Wednesday and
Friday -- could not be expressed. Added as a daily habit, it showed four
misses a week it never was, dragged completion and its own rate down, and
broke the streak on every rest day. So it was simply not added.

Giving a habit a set of weekdays raises the question ADR 0015 answered for
archiving: what happens to the past when the setting changes. If the
schedule is one field on the habit, moving the gym from Monday / Wednesday /
Friday to Tuesday / Thursday / Saturday turns every past Tuesday into a miss
and every past Monday into a day off. The history is rewritten by an edit.

The counter's target already had this bug, unnoticed: a habit had one
`target`, every past day was measured against the current one, and raising
water from 8 to 10 glasses turned every old 8 / 8 day into 80%.

Three ways to keep the past:

- the schedule and the target on the habit, and the past reread -- what the
  target did, and the bug;
- a dated history of schedules and of targets, alongside the periods;
- the schedule and the target on the period.

## Decision

**A period carries the weekdays the habit is scheduled on and, for a
counter, its target.** A habit's current schedule and target are those of
its open period, or of its last one when it is archived.

**Changing the days or the target closes the current period at today and
opens a new one from today**, the same move archiving and restoring already
make. A second change on the same day amends the period opened today instead
of leaving an empty one behind. Amended back to what the period closed that
morning had, the period opened today goes and that one is open again: the
habit is as it was, not two ranges saying the same thing. A period closed on
an earlier day is never touched. Restoring reopens with the last period's
days and target. Archiving or restoring is a write of its own: one that also
changes the days or the target is refused, so an archived habit is restored
before it is changed, never edited behind its own back.

**A habit is measured only on the days it is scheduled** -- active, and the
day's weekday among its period's days. Every derivation that asked "was it
active?" asks "was it scheduled?". A day with nothing scheduled is skipped by
the streak and left out of the averages, as a day with nothing active
already was (ADR 0017). A tick on a day off is recorded and shown, and counts
toward nothing.

A period has at least one day; a habit expected on no day is an archived
habit, and archiving has its own action. Migration gives every existing
period all seven days and the habit's current target: nothing has been a day
off until now, and no earlier target is known to recover.

## Consequences

- One mechanism answers "what was true of this habit on that day" -- whether
  it existed, whether it was expected, what it was measured against. A
  separate dated history would have been a second invariant to keep in step
  with the periods.
- Changing a target no longer rewrites the past, which the glossary claimed
  and the code did not do.
- A habit whose schedule changes often accumulates periods. "Archived" is
  still "no open period", so nothing about archiving changes.
- A number of times per week ("three times, any days") is not a schedule this
  can express, on purpose: it has no day on which it is missed until the week
  is over, and every habit number here is computed one day at a time.
- Moving the days or the target back onto the habit, or mutating a closed
  period to "correct" a schedule, is the bug this decision exists to prevent:
  it silently re-measures every day already lived.
