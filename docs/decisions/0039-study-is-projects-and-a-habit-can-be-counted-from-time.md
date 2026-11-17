# 0039. Study is part of Projects, and a habit can be counted from a time area

- **Status** accepted
- **Date** 2026-11-17
- **Amends** [0037](0037-jarvis-the-check-in-is-the-product.md) (time areas, the check-in's questions)

## Context

After a week of the one-question-at-a-time check-in (ADR 0037), the daily
questions asked the same thing twice without connecting the two. "Gym: done
today?" was a habit question, and the time question then asked how long went
to Training -- one fact, two answers that could disagree. Study was a time
area next to Projects that was never used apart from it. A habit called "Deep
work blocks" was a third copy of what the time already said.

Archiving a habit is the user's to do in the app. What this record decides is
the two changes the code needs.

## Decision

**Study is part of Projects.** `study` leaves `TIME_AREAS`; the areas are
work, projects, training and refereeing. Schema 23's migration adds every
day's study minutes to its projects minutes and removes the `study` key,
capped at the most one area takes in a day; a day declared with study alone
stays declared. Kept `time.set` records on `study` are history and are not
rewritten: their receipt line still says what was said, and their undo is
**locked** as changed since (`isLocked`), so it neither crashes nor writes the
old area back. Migrating their params to `projects` was the alternative, and
was worse: the minutes they would restore are study's, not projects', and an
undo would wipe the projects time beside them.

**A check habit may be counted from one time area.** The habit names it in
`countedFrom`, one of `TIME_AREAS`, on a check only. Such a habit:

- is **not asked** in the check-in: the time question answers it, and it never
  adds to what is left;
- is **kept** on a day whose declared time for the area is above zero, **not
  kept** on a day whose time is declared with none for it ("nothing to
  declare" included) -- a miss with no reason unless one was given -- and
  **not recorded** on a day whose time is not declared;
- is **derived, never stored** (rule 6): `habitValueOn(habit, log)` in
  `lib/domain/derive/habits.js` is the one reading of a habit's day, and every
  reader -- rates, the heatmap, completion, the streak, the week's figures, the
  home card, the check-in, the question context -- goes through it;
- is **never ticked by hand**: the store refuses the tick (`logHabitValue`, a
  day's habits patch) with a sentence that says where its day comes from, the
  `habit.set` action refuses it before writing, and the model is told such
  habits apart and its requests for them are dropped;
- still takes a **skip reason** on a day the time does not keep it, and a
  time write that keeps it drops the reason, as a tick does.

**It is a field, not a link.** Rule 5 is about relations between entities --
a task and a person, a habit and a goal. The area a habit is counted from is
the habit's own configuration, like its type and its days, and an area is a
closed vocabulary, not an entity. Absent is "ticked by hand"; the store keeps
no key for it, so habits written before it read the same.

**A tick from before is history.** Pointing a habit at an area reads every
day from its time, earlier ones too, since nothing is stored to version. A
day that already held a tick stays kept, so pointing a habit at an area never
unticks its past.

## Alternatives considered

- **Ticking the habit from the time when the time is saved.** It would store
  what can be derived, and the two would drift the first time the time is
  corrected without the tick.
- **Asking the habit question and filling the time from it.** "Done" says
  nothing about how long; the time question is the richer answer.
- **A period-versioned `countedFrom`, like days and targets (ADR 0029).** The
  value is derived when read and old ticks are kept, so the past is already
  safe; a period would add a write path for no figure that changes.
- **Removing the habit and reading Training time alone.** The habit's rate,
  its streak and its skip reasons are what the user reads; they stay.

## Consequences

- The check-in asks fewer questions on a training day, and the gym and its
  training time can no longer disagree.
- Every habit number now reads a day's time as well as its ticks. A new
  reader of a habit's day calls `habitValueOn`, never `log.habits[id]`.
- A day whose time is declared counts as recorded for a habit counted from
  it (`isRecorded(log, habits)`), so the other habits that day read as not
  done rather than not recorded.
- The seed's demo gains a daily "Gym" counted from Training, so the sandbox
  shows a check, a counter and a habit counted from time.
- Do not "restore" `study` as an area, or tick a counted habit to make a
  figure look right: declare the time.
