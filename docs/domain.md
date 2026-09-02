# Domain

The vocabulary of PersonalOS. Terms mean what this file says they mean, in the
code and in conversation. `lib/domain/types.js` is the machine-readable twin;
when a concept changes, both change in the same commit.

Identifiers and user-facing strings are in English. The spec this project grew
from uses Italian names for several of these; the mapping is one to one and is
recorded in ADR 0004.

---

## Capture

**Is** the raw sentence you said, kept verbatim, plus what the system decided
to do with it.

**Is not** a task. A capture may produce a task, or a meal, or nothing but a
memory entry. The sentence and its filing are separate facts, because the
filing can be wrong and the sentence cannot.

**Has** `text`, `source`, `destination`, `targetId`, `route`, `createdAt`.

`destination` is one of the seven in `DESTINATIONS`: `task`, `people`,
`finance`, `nutrition`, `health`, `goals`, `memory`. Validated against that
list, never trusted from the model.

`route` records **how** the destination was decided: `model` or `rules`. This
field exists because a silent fallback is a lie. Without it, an expired API key
looks like a model that quietly got worse, and you would not find out for days.

**Relations** every capture writes a [Memory](#memory) entry, whatever else it
writes.

---

## Task

**Is** a commitment, almost always owed to someone.

**Is not** a calendar event, and not a diary entry. It is also the single
entity behind both the `task` and the `people` capture destinations: those
differ in whether a person is attached, not in kind. There is no separate
"CRM item".

**Has** `title`, `note`, `band`, `temperature`, `personId`, `tags`, `position`,
`createdAt`, `completedAt`.

**Bands**, most urgent first: `overdue`, `today`, `week`, `later`. Bands and
not due dates, because dated lists rot -- everything slips and rescheduling
becomes a second job. A band answers the only question actually asked: how
soon?

**Transitions**
- Created in `today`, `week` or `later`. **Never in `overdue`.** Being late is
  something that happens to a task, not a way to be born. The store rejects it.
- Moves band when you drag it, or when the day turns: an unfinished `today`
  task becomes `overdue` on the first read of the following local day. Derived,
  never assigned.
- Completing sets `completedAt` and writes an [Activity](#activity) entry. It
  does **not** delete: the weekly review is made of exactly this material.

`position` orders a task within its band and is what dragging sets. It is the
third sort key, after band and temperature, for the three tasks the Session
card shows in the morning.

---

## Person

**Is** someone tasks can be owed to, with enough context to prepare a call.

**Is not** a contact book, and not a CRM record in the commercial sense. There
is no pipeline, no deal, no stage.

**Has** `name`, `organization`, `kind`, `note`, `createdAt`.

**Relations** a [Task](#task) may point at one. Tasks without a person are
grouped separately, last, in the by-person view.

---

## Memory

**Is** the archive of everything the system has ever been told.

**Is not** only what the `memory` destination produces. Every capture writes a
memory entry regardless of destination; `memory` as a destination means "no
other card owns this", not "remember this one".

**Has** `text`, `source`, `createdAt`.

On the local path a question passes the whole archive to the model, which is
both simple and often better than similarity search, because the model sees the
whole picture. It stops working somewhere in the thousands of entries -- that
is when embeddings earn their place, not before.

---

## Daily Log

**Is** one calendar day of measurements, keyed by day key.

**Is not** a place for anything that must survive the day. Goals in particular
do not live here, and the reason is in [Goal](#goal).

**Has** `date`, `habits`, `meals`, `measurements`, `notes`.

`date` is `YYYY-MM-DD` **in the user's timezone**, produced by
`lib/domain/dates.js`. Never by the server clock. A day that was never written
to reads back as an empty log rather than as missing, so callers can tell "you
recorded nothing" apart from "outside the window".

---

## Habit

**Is** something you do every day, configured in the profile, not in code.

**Types** `check` (done or not) and `counter` (counted against a target).

**Transitions** a click ticks, increments, or -- on a full counter -- rolls
back to zero, which is also the simplest way to undo one click too many. At
each new local day the card starts empty; past days stay in their logs.

The **streak** counts backwards over consecutive days with at least one habit
completed. A day still in progress does not break it.

---

## Goal

**Is** a promise you made yourself, for the week or the month.

**Is not** a measurement, and this distinction is the entire reason goals are
stored on their own instead of inside a daily log. "I read today" belongs to
today and resetting it tomorrow is correct behaviour. "Sign the contract this
week" does not stop existing on Monday morning. Attach a goal to a period and
Monday it silently disappears -- not deleted, just stranded in last week where
you will never look. The damage is worse than a bug because it does not look
like one: it looks like a fresh start.

**Rule: goals never reset on their own.** You close them or you remove them.
There is no calendar logic anywhere near them, and there must not be.

**Has** `name`, `done`, `progress`.

---

## Nutrition

**Is** the meals of one day, inside that day's log.

**Has** per meal: `time`, `name`, `calories`, `protein`, `carbs`, `fat`,
`estimated`.

The four numbers are not independent: calories **are** the macros, at
4 kcal/g protein, 4 carbs, 9 fat. Change a macro and calories recompute
locally, instantly, with the formula -- where an exact formula exists, the
formula beats the model every time. Change calories and the model redistributes
the macros, because the formula alone has infinitely many solutions and a
plausible composition is knowledge the model has.

`estimated` marks a model guess and clears on any value you correct by hand.

---

## Health

**Is** the last thirty daily logs, aggregated. Almost entirely a view.

**Is not** a place that writes anything, apart from the measurements a capture
files -- a weight, say.

**Averages divide by recorded days only.** A day with no meals is a day you did
not record, not a day you did not eat. Counting it as zero would make every
skipped day flatter your deficit, and the card would congratulate you for the
days you ignored it. It states how many days it is averaging over, so the
number carries its own reliability.

---

## Finance

**Is** dated snapshots extracted from your own spreadsheet, plus the deltas
between them.

**Is not** a ledger, and not something you keep up to date by hand. The finance
card is the one that dies first in every personal system, because maintaining
it is work and work without a deadline stops happening. The answer is not more
discipline: you keep your spreadsheet the way you always have, and the system
reads it.

**Extraction runs only from the refresh button, or a scheduled job. Never on
page load.** This is the most expensive call in the system -- your whole
spreadsheet goes into it -- and attaching it to a render means a browser tab
left open costs money while you are at lunch.

Snapshots accumulate, and that accumulation is the history the deltas are
computed from. A capture filed as `finance` does **not** change net worth: it
becomes a memory entry and a note on the day. The spreadsheet is the only
source of the numbers.

---

## Activity

**Is** a log of what the system did and when.

**Is not** an audit trail for security. It exists so the weekly review can say
what you actually closed.

**Has** `action`, `subjectId`, `detail`, `at`.

---

## Open questions

Recorded rather than answered, so nobody silently invents an answer:

1. A capture filed as `goals` -- week or month? Current intent: default to
   week, and let the classifier return a period when it can tell.
2. A capture filed as `health` has nowhere to go until a metric exists. Weight
   is the obvious first one, and the guide is explicit about not building the
   column before the data exists.
3. Whether `people` should also create a Person record when the name is new, or
   only link an existing one. Creating silently risks duplicates from spelling.
