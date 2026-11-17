# 0040. Home shows what needs you and what is worth noting

- **Status** accepted
- **Date** 2026-11-17
- **Amends** [0037](0037-jarvis-the-check-in-is-the-product.md) (Today, the first of the five places)

## Context

After the check-in moved to the top of Home (ADR 0037), the cards under it
stayed as they were ported from the mockup: Today with the profile and the
focus, Session, Habits with tick boxes, Calendar, Pulse and Goals. In use,
Home was long and was not read: most of it was something to explore, and the
one thing that matters there -- whether something needs doing -- had to be
looked for. The habits were ticked in two places, the card and the check-in,
for one fact. Money moves slowly and does not need a card every day.

## Decision

**Home is built around what needs you, not around cards to explore.** Under
the check-in, unchanged:

- **Needs you**: one short list of what needs a gesture today -- today's
  appointments still to come, the tasks overdue or due today (the most urgent
  five, then "and N more"), the captures left unclassified, and last week's
  review while it is not done. Each row says what it is and opens where it is
  done. With nothing, one calm line.
- **Worth noting**: at most three sentences computed from the data, only
  when something differs from usual -- this week's lever, a habit missed on
  its last three scheduled days, the habits kept this week against the four
  weeks before, last week's spending against the weeks before it, net worth
  over 30 days. Each rule is one threshold in `limits`, one pure derivation
  in `lib/domain/derive/home.js`, tested at, below and above it. Each
  sentence cites its number and links to the screen that shows it; it
  describes, never explains or judges (ADR 0037). Absent when nothing
  differs.
- **Four tiles**: habits kept this week, net worth, open goals, the
  journal. One number each, the whole tile a link.

**Cards that only display move to their screens.** Today, Session, Habits,
Calendar, Pulse and Goals left Home; nothing else mounted them, so they and
their tests were deleted. **Habits are ticked by the check-in and the Habits
screen only**: the check-in writes the values, every other block reads them.

**No model, no stored state.** Everything is derived on each load from what
the store holds (rules 3 and 6); the check-in's refresh redraws it.

## Consequences

- The profile's `focus` is no longer shown anywhere; the field stays. The
  lever shows as the first note.
- No screen lists the week's appointments any more; today's still to come
  are in "Needs you", without a link, since no screen holds them. A calendar
  belongs to a later place, not back on Home.
- `sparkBars` and `weekDensity` in `lib/domain/derive/` lost their only
  screen; they are left for the place that needs them next.
- A note repeats every day while it holds: last week's spending stays the
  same all week. A dismissal would be stored state; it is not built.
- Do not add a card to Home to make something visible. Add a row to "Needs
  you" when it needs a gesture, or a rule to "Worth noting" when it differs
  from usual -- with its threshold, its test and a number to cite.
