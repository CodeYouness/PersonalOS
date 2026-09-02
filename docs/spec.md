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
browser's speech recognition. It is classified into one of seven destinations
-- task, people, finance, nutrition, health, goals, memory -- and produces a
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
