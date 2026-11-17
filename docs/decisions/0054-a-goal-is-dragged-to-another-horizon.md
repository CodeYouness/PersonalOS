# 0054. A goal is dragged to another horizon, and no drag is the only way

- **Status** accepted
- **Date** 2026-11-17

## Context

The owner asked to drag a goal on the Goals screen from "This week" to "This
month". Until now the app had no drag anywhere, on purpose: the Habits list
reorders with an up/down pair because drag-and-drop "is a keyboard and touch
trap" (ADR 0016), and the CRM board left the mockup's drag out
(`docs/spec.md`). Both reasons still hold -- HTML5 drag-and-drop does nothing
under a finger on iOS Safari, and a drag alone is out of reach of a keyboard
-- so a drag has to answer them rather than ignore them.

Moving a goal to another group already exists as a write: the panel's
Horizon control sends `PATCH /api/goals/<id>` with `{ horizon }`, and
`updateGoal` refuses a done goal and restarts the goal's age
(`horizonSetOn`) when the horizon is a different one (ADR 0021).

## Decision

**Dropping a goal on another group is choosing its horizon.** The drop sends
the panel's write, to the same route with the same body, so the store's one
rule decides both: a different horizon restarts `horizonSetOn`, the same
one is not sent, a done goal is refused. Nothing new is stored -- no order
within a group: the goal lands where the group's order (nearest target date
first) puts it.

**A drag is never the only way.** The panel's Horizon control does the same
move with a keyboard or a tap. A screen that adds a drag keeps, or adds, a
control that does the same thing.

**Pointer events, one implementation.** A mouse picks a goal up from
anywhere on its row; a finger or a pen only from the row's grip, the one
element with `touch-action: none` -- so a finger anywhere else on the row
scrolls the page as before, and nothing waits on a long-press timer that
fights iOS's own long-press. A press becomes a drag only past 8px, so a tap
or a click still opens the goal; the click a mouse makes on release after a
drag is swallowed.

**What a drag shows.** The row dims where it was and a copy follows the
pointer with the float shadow; while a goal is held every horizon shows a
group -- an empty one as "Nothing here yet" -- and the group under the
pointer is marked. Dropping outside every group, back in its own, or
pressing Esc puts it back; Esc does not also close the panel. Near the top
or bottom of what scrolls, the list scrolls.

**Optimistic, then the real state.** The goal shows in its new group at
once, its age predicted as restarted; a refused write puts it back and says
why, and the screen re-reads what was saved either way. A panel open on the
moved goal takes the new horizon.

Done goals are neither picked up nor dropped on: the panel's controls are
locked for a done goal, and the done group is not a horizon.

## Consequences

- The client predicts the store's `horizonSetOn` rule only for the moment
  before the refresh (`withHorizon` in `components/goals.js`); the store
  stays the rule. Change the rule there and the prediction is wrong for a
  frame, never in what is saved.
- The grip is 32px wide, under the 44px target: a finger has the whole row
  to open a goal and the grip to carry it, and the keyboard has the panel.
- Habits keep their up/down pair and the CRM board stays without drag; this
  decision does not reopen them. Either could take a drag now on the same
  terms -- a control that does the same thing, pointer events, a grip for
  touch.
