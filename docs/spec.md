# PersonalOS -- product spec

Our own spec, started from the guide in `docs/spec-source.md` and diverging as
decisions are made. This file, not the guide, is what the code answers to.

## The problem

The trouble with personal systems has never been where to put things. It is
that at the moment a thought arrives, opening the right app and filing it costs
more than the thought is worth. So you do not, and it is gone.

## The promise

One gesture. You say the thing -- typed or spoken -- and the system decides
where it belongs. When you ask a question, it answers from your own data and
says where each claim came from.

Two guarantees follow, and they are the product:

- **A capture is never lost.** If the model is unreachable, keyword rules file
  it instead. Filed badly beats never existing.
- **An answer never invents.** Every claim cites its source. If something is
  not there, the system says so.

## Scope

One user. No accounts, no sharing, no multi-tenancy. Almost every hard-looking
decision becomes easy once that is settled.

## Capture

Text arrives from the capture bar on the dashboard, by keyboard or by the
browser's speech recognition. It is classified into one of eight destinations
-- task, people, finance, nutrition, health, goals, memory, appointment -- and produces a
raw capture record, a memory entry, and whatever the destination owns.

The classification is validated against the canonical list, and how it was
decided is stored next to the result.

## The cards

Each answers a question you actually ask. If a card has no question, it does
not get built.

| Card | The question |
| --- | --- |
| Operator | who am I, and what is today about |
| Session | what are the three things that matter now |
| Calendar | what is coming |
| Habits | where am I today |
| CRM | who is waiting on me, and how urgently |
| Nutrition | how much have I eaten |
| Health | how is the month going |
| Goals | what did I promise myself |
| Finance | am I going up or down |

Rules that hold for all of them:

- No card calls the model when a page loads. Cards read the last saved value.
- Every gesture responds immediately, then saves. A failed save re-reads real
  state rather than leaving the screen lying.
- Numbers right-aligned with tabular figures, so columns stay comparable.
- Colour carries meaning, never decoration -- and the metric decides the
  colour, not the sign. Weight going down may be exactly what you wanted.

## Habits

"Where am I today", answered twice: a compact card on the home screen, and a
Habits screen for managing the list and reading the history.

**Every active habit, every day.** A habit is daily by definition; there is no
per-weekday schedule. The home card shows all of them, with today's completion
as a ring and the streak beside it.

**Ticking.** A `check` flips on a tap. A `counter` goes +1 on a tap, with a
separate "−" once it is above zero. It may go past its target -- ten glasses
out of eight is true -- and never below zero. Every tick saves one value, on
its own; two quick taps on two habits never overwrite each other.

**The past can be corrected, the future cannot.** Forgetting to tick yesterday
is the common case. The home card only shows today; any day up to today is
corrected from the history heatmap on the Habits screen. A day on which the
habit was not active cannot be ticked.

**A habit is active over periods of days.** Creating it opens a period;
archiving closes it, the archive day excluded; restoring opens a new one. Every
number -- completion, streak, rates, the heatmap -- counts a habit only on the
days it was active, so archiving never rewrites the past, and the days a
habit spent archived stay out of it after a restore. Nothing is deleted.

**What you can change from the screen:** add a habit (label, type, target),
rename it, change a counter's target, archive or restore it, and move it up or
down. The type never changes after creation -- archive it and make a new one.

**History** is the last 30 days: one row per habit, one cell per day, and the
rate for that row. A day with nothing recorded for any habit is drawn as "not
recorded", never as a failure. The summary above it gives completion, perfect
days and days recorded over the same 30 days -- and the current streak, which
is the running one the home card shows, not a number cut down to the window.

**The timeline hears about it once**: a `habit.ticked` event when a habit's day
becomes complete, not on every tap and not on a correction downward. Creating,
renaming and archiving a habit is configuration, not something that happened
to you, and writes no event.

Not yet: a period selector, the longest streak, per-habit streaks, ticking a
habit from the capture bar, and linking a habit to a goal from the UI.

## CRM

"Who is waiting on me, and how urgently", answered on a CRM screen reached
from the navigation. There is no CRM card on the home screen: the Session
card already is the home view of tasks, and it stays read-only.

**The board** shows every open task in four columns -- Overdue, Today, This
week, Later -- most urgent first inside each. Overdue is something that
happens to a `today` task whose day has passed; it is a column, never a band
you choose. Each ticket shows who it involves, its temperature, its tags, and
its age: days since it was created, the same meaning in every column. A
completed task leaves the board.

**By person** groups the same open tasks by who they are owed to, the person
waiting hardest first, and the tasks nobody is linked to last.

**The detail panel** opens on the task you select and edits what is yours:
title, note, band, temperature, tags and the person. Choosing a band restarts
its clock -- choosing Today on an overdue task means "yes, today, really" and
takes it out of Overdue. Complete records it on the timeline and offers
Reopen until the panel closes; Delete asks first, and a capture that produced
the task keeps its sentence. The panel says where the task came from and how
it was filed.

**A person is added by you, never guessed.** The Person field picks from your
people or adds a new one by name. A capture filed as `task` or `people`
becomes a task linked to the person it names -- whoever it names most
completely, and no one on a tie -- and never creates a person, so a
misspelling never becomes a duplicate.

**Tasks are created by capture.** The screen has no form for a new one.

Not yet: search, drag, editing a person's details, a CRM card on the home
screen, and the mockup's "Blocked" section.

## Nutrition

"How much have I eaten", answered on a Nutrition screen reached from the
navigation. There is no Nutrition card on the home screen. The card shows
today: calories against your target, protein, carbs and fat in grams, and
the day's meals in the order they were eaten.

**You say a meal, you do not fill one in.** A meal arrives from a capture --
the capture bar, or the card's own "Describe a meal" box, which is a capture
already filed as `nutrition`. One sentence is one meal. The model estimates
its calories and macros, marks it estimated, and places it on the day and at
the time it was eaten: "last night I had pizza", said in the morning, is
yesterday's dinner.

**Unknown is not zero.** With no model, a meal is still filed, by name, with
no numbers -- and a number the model gets absurdly wrong becomes unknown
rather than being believed. A meal moved to another day with no time said
has no time rather than an invented one. The day's total counts only meals
with numbers and says how many had none.

**Calories are their own number.** Changing a macro recomputes calories at
4/4/9 kcal per gram; changing calories changes only calories. A beer's
calories are more than its macros explain, and that is not an error (ADR
0019).

**The headline** reads "1,780 of 2,200 kcal · 420 left"; past the target,
"250 over", in the warning colour and never red; before any meal, "Nothing
recorded today".

**Correcting a meal.** Every field can be corrected on the card; any hand
correction clears "estimated". Delete asks first, and the capture that
produced the meal keeps its sentence. From the capture log, Undo removes the
meal and Refile into `nutrition` files one -- both refused once the meal has
been corrected by hand.

Not yet: macro targets, past days (they belong to Health), several meals from
one sentence, a Nutrition card on the home screen, and the glucose sensor.

## Health

"How is the month going", answered on the same screen as Nutrition, next to
today's card -- the navigation entry reads "Nutrition & Health". The card
looks back over a fixed rolling 30 days.

**The averages** -- calories, protein, carbs and fat -- cover the 30 days
before today. Today is still happening: a morning with only breakfast would
drag the month down every day until dinner, so it is shown, not averaged.
A day counts towards a number's average only when it has a meal with that
number: a day with nothing recorded, or whose meals all lack calories, is a
day you did not record, never a day you ate nothing. A caption says how many
days were left out and how many meals had no numbers. Calories read "avg
2,105 of 2,200 kcal", in the warning colour when over and never red.

**The table** has one row per recorded day, newest first, today labelled
"Today": kcal, protein, carbs, fat, the number of meals and the day's
weight. A day's kcal over the target takes the warning colour; an unknown
figure is "—". Days with nothing recorded are left out of the table rather
than listed as empty. Expanding a day -- one at a time -- shows its meals
with the same correction and delete as the Nutrition card, so a meal filed
on an earlier day can be put right there.

**Weight is said, like a meal.** "Weighed 74.6 this morning" in the capture
bar is a `health` capture that files a weight. The model reads the number
and the day it was taken; with no model, a number followed by "kg" is read
onto today. Only 20 to 300 kg is believed: anything else files no weight,
keeps the sentence, and the receipt says so. A health sentence with no
weight in it is kept as a capture and a memory, as before. Several weights
on one day are all kept and the day shows the last one said.

The card shows the latest weight and its change since the first weight in
the window, in a neutral colour: without a goal, nothing says whether down
is good. A wrong weight is corrected from the capture log -- Undo removes
it, Refile into `health` files one -- not on the card.

Not yet: a period selector, a weight goal, any metric other than weight,
editing a weight on the card, a Health card on the home screen, the glucose
sensor and all-day wearables.

## Goals

"What did I promise myself", on the home screen and on its own screen,
`/goals`, next to CRM in the navigation. A goal arrives the way everything
does: said in the capture bar, filed as `goals`, with the horizon `week`.

**The home card** is read-only. It lists the open goals grouped This week /
This month / Open; within a group, the nearest target date first, goals
with no target date after them, and the oldest first among equals. A row
shows the name, a mark when it is a project, the progress ("1 / 3") and the
target date when there are any, and -- when the goal has slipped -- the
period it is in: "2nd week", "3rd month". A target date already passed is
in the warning colour. Nothing about a goal changes because time passed; it
leaves the card only when you close it or delete it. Open goes to the
screen; a row opens that goal there.

**The screen** has the same groups. Selecting a goal opens a panel to
correct its name, kind, horizon, target date and progress, close it as
Done, or delete it after a confirmation. Changing the horizon is promising
it again: its age starts over. Progress is typed, whole numbers, and
reaching the target does not close the goal. Done goals sit in a collapsed
group at the bottom, newest first, each with Reopen; a done goal is
reopened before it is edited.

Not yet: adding a goal anywhere but the capture bar, progress derived from
linked tasks or habits, linking a task to a goal, and the Review screen's
"Closed" and "Slipped".

## Memory

Everything that passes through leaves a trace. Questions are answered over that
archive, with sources cited. On the local path the whole archive goes to the
model, which is simple and often better than similarity search. It stops
scaling somewhere in the thousands of entries; that is when embeddings earn
their place.

## What this is not

Not a team tool. Not a project manager -- one level of nesting at most, if
ever. Not a budgeting app: the finance card reads a spreadsheet you keep
yourself and never asks you to maintain it twice. Not a habit tracker with
streak gamification: the streak exists because it is information, not a score.

## Explicitly deferred

Going online, and everything that depends on it: a hosted database, the
password gate, Telegram capture, voice transcription, embeddings, the morning
briefing, automatic backup. See `docs/roadmap.md`.
