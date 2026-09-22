# 0016. A habit's order is its place in the list, and its type never changes

- **Status** accepted
- **Date** 2026-09-22

## Context

The Habits screen (#38) is the first place a habit can be created, renamed,
retargeted, archived, restored and reordered. Two questions had to be settled
before any of that could be written, and neither was covered by ADR 0015,
which only decided how a habit's *active days* are recorded.

**Where does the order live?** A `Task` carries a `position` field and is
sorted by it within a band. Copying that to `Habit` was the obvious move, and
it is the wrong one here: a task's position is meaningful relative to other
tasks *in the same band*, so it has to survive a task changing band. Habits
have no band. They are one list, in the profile, already stored as an array.
A `position` field on top of an array is two orders that can disagree, and
one of them is going to be repaired by the wrong code path eventually.

**Can a habit change type?** `check` and `counter` are not two presentations
of one thing. A check's history in `dailyLogs` is booleans, a counter's is
numbers, and `completionRatio`, `hasAnyCompletion` and `ratesByHabit` all
read a logged value by way of `habit.type`. Flipping the type does not
convert the history; it reinterprets it. Every day already recorded would
start being read as something it was never written as.

## Decision

**The array is the order.** `profile.habits` is ordered, and its order is the
order the habit appears in every list. There is no `position` field.
Reordering is `reorderHabits(ids)`, which takes the whole order and requires
it to be an **exact permutation** of the ids the store currently holds — same
length, same set, no duplicates. Anything else is rejected.

A "move this one up" API was deliberately not built. A step is relative to a
list the client last saw, so a step that raced another edit applies to the
wrong neighbour. Sending the whole order at least makes the client state the
list it believes in, and a list that has gained or lost a habit since is
rejected outright.

What the permutation check does *not* catch is a stale order over the same
set of habits -- reordering the same four habits from an old snapshot is a
valid permutation. Nothing on the server can distinguish it, so the screen
is what prevents it: `HabitsManager` keeps its controls disabled until the
refresh following a write has actually rendered, so the next move is always
computed from an order the server has confirmed. A second browser tab can
still overwrite the first's ordering, and that is accepted: this is a
single-user system, the loser is the order of a habit list, and nothing is
lost that re-dragging does not fix.

**`type` is not patchable.** It is absent from `HABIT_PATCH_FIELDS`, so a
patch naming it is rejected by `validatePatch` rather than ignored — the
caller and the store disagreeing about what a habit is should be an error,
not a shrug. Changing what you track means archiving the old habit and
adding a new one, which ADR 0015 already makes cheap and lossless: the old
days keep counting for the old habit, on the days it was active.

`target` follows the type on the way in as well. A `check` arriving with a
target, or a `counter` without one, is rejected by the single habit
validator rather than coerced — a habit created with a silently-dropped
field is a habit the caller thinks it made and did not.

## Consequences

- Reordering rewrites the whole `habits` array on every move. For a personal
  habit list this is free, and it is the reason there is no second source of
  truth for the order to drift from.
- The UI reorders with up/down buttons, not drag-and-drop: a keyboard and
  touch story for free, and it matches an API that thinks in whole orders.
  The mockup's drag grip is not built.
- A future screen that lets you "convert" a check to a counter must do it as
  archive-plus-create, and must not be talked into a `type` patch on the way
  past. The history is the reason.
- A future storage adapter with real rows will need an explicit order column
  to preserve this, since row order in a table means nothing. That is the
  adapter's problem to solve behind the same contract, not a reason to add a
  field here now.
