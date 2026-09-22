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
people or adds a new one by name. A capture filed as `people` becomes a task
linked to the person it names -- by full name, or by a first name only one
person has -- and never creates a person, so a misspelling never becomes a
duplicate.

**Tasks are created by capture.** The screen has no form for a new one.

Not yet: search, drag, editing a person's details, a CRM card on the home
screen, and the mockup's "Blocked" section.

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
