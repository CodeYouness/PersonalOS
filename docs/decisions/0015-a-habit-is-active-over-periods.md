# 0015. A habit is active over periods, not a single archived flag

- **Status** accepted
- **Date** 2026-09-18

## Context

`Habit.archived` was a single boolean. Archiving flipped it to `true` and
every derived number that cared -- `completionRatio` -- stopped counting the
habit from that point on. But `hasAnyCompletion` (and therefore `streak`) and
`ratesByHabit` never filtered on it at all: an archived habit's old ticks kept
inflating a streak, and its own rate, forever.

That inconsistency is a symptom of the real problem: a boolean cannot say
*when*. Restoring an archived habit set `archived` back to `false`, which
made every day in the archived gap look, retroactively, like a day the habit
was active and simply not done -- exactly the kind of stored-derived-value
drift ADR 0008 already warns about, just one field over. Fixing
`hasAnyCompletion` and `ratesByHabit` to also check `archived` would only have
made the gap wrong in a different, more precisely-averaged way.

## Decision

**`Habit.periods` replaces `Habit.archived`.** A period is a half-open day-key
range, `{ from, to }`: active from `from` up to but not including `to`. A
habit's `periods` are ordered oldest first, non-overlapping, and only the
last may be open (`to: null`). Archiving closes the current period at today;
restoring opens a new one starting today. The days in between belong to no
period.

**"Archived" is now derived**, the same shape ADR 0008 already established for
`overdue`: a habit is archived when it has no open period.

```
isActiveOn(habit, dayKey) =
  habit.periods.some(p => dayKey >= p.from && (p.to === null || dayKey < p.to))
```

Every function in `lib/domain/derive/habits.js` that used to filter on
`!habit.archived` (only `completionRatio` did) or not filter at all
(`hasAnyCompletion`, and by extension `streak`, and `ratesByHabit`) now calls
`isActiveOn` per day instead. A habit counts on a day if and only if it was
active that day -- nothing before its first period, nothing in an
archived-then-restored gap, everything in between.

Migration v4 → v5 gives every existing habit one period: opening on the day
its earliest tick appears in `dailyLogs` (or today, if it was never
recorded), closed at today if the habit was archived. This is the same
"invent nothing, use the most honest date available" posture v1→v2 already
took for `bandSetOn` on a stored-overdue task.

The store boundary (`lib/adapters/json/index.js`) validates a habit's shape
on every `updateProfile` patch -- label, type, target, and that `periods` is
well-formed per the invariant above -- since `habits` used to be a bare
`requireArray` check (any array, any shape) and this is the first place any
of it was enforced.

## Consequences

- `completionRatio`, `hasAnyCompletion`, `streak` and `ratesByHabit` now agree
  with each other and with `docs/domain.md`'s "archiving keeps the history"
  claim, which the code did not actually keep before this.
- Nothing about the UI changes. There is no habit screen yet (`app/` and
  `components/` reference `habits` only as a count); this is a pure
  correctness prefactor ahead of the habits card and screen (#37-#40).
- A future edit that mutates a closed period in place, or that "archives" a
  habit by deleting its period instead of closing it, is the bug this
  decision exists to prevent -- it would silently make every prior active day
  invisible, the same failure mode ADR 0014 names for a hard-deleting sync.
