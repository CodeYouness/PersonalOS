# Domain

The vocabulary of PersonalOS. Terms mean what this file says they mean, in the
code and in conversation. `lib/domain/types.js` is the machine-readable twin;
when a concept changes, both change in the same commit.

Identifiers and user-facing strings are in English (ADR 0004).

## The three rules that explain everything else

**1 · Relations live in links.** No entity holds a foreign key to another. A
task does not carry a `personId`; there is a Link saying
`task --involves--> person`. One place to look, one place to query, and
relating two things never means writing to either of them. ADR 0006.

**2 · Canonical or derived, never both.** A field is canonical when you decided
it or a source observed it. Anything computable from canonical data is
computed, in `lib/domain/derive/`, and never stored. There is exactly one
documented exception and it is the net worth snapshot. ADR 0008.

**3 · The original is never lost.** A capture keeps its sentence after being
filed. A journal entry keeps its text after a memory is extracted from it.
Everything downstream is a reading, and a reading never replaces what was read.

## Identity

Every entity's id carries its type as a prefix: `task_9f2c`, `person_seed_1`.
That is what lets a reference be a plain string everywhere — in a link, in an
event subject, in a memory's provenance — instead of a `{type, id}` pair every
caller has to assemble. `lib/domain/refs.js` parses and validates them; a
prefix outside `ENTITY_TYPES` is rejected at the boundary.

Every canonical entity also carries `createdAt`, `updatedAt` and `source`.
`source` answers "who created this" — `user`, `capture`, `journal`,
`integration`, `derived`, `seed` — which is the first question worth asking
when a record looks wrong.

---

## Link

**Is** an edge in the life graph: two references and a relation.

**Is not** free-form. `rel` comes from `LINK_RELS` in `personalos.config.js`.
An open vocabulary would be unqueryable within a year, because nobody
remembers whether it was `belongs_to`, `belongsTo` or `parent`.

**Has** `from`, `to`, `rel`, `confidence`, `createdAt`, `source`.

**The vocabulary**

| rel | Reads as | Typical use |
| --- | --- | --- |
| `belongs_to` | child → parent | task → goal · goal → project · habit → goal |
| `involves` | a person takes part | task → person · event → person |
| `about` | loose subject matter | memory → anything · capture → what it produced |
| `derived_from` | provenance | memory → journal · memory → capture |
| `funds` | money aimed at something | transaction → goal |

Links are a **set**: the same two things related the same way twice is one
fact. Deleting an entity deletes its links, because an edge pointing at
nothing is worse than no edge.

`confidence` is null when you made the link and a number when a model
proposed it. That is what will let a future review ask "do you want to keep
this connection?" instead of silently asserting it.

---

## Capture

**Is** the raw sentence you said, kept verbatim, plus what the system decided
to do with it.

**Is not** a task. A capture may produce a task, a meal, a transaction, or
nothing but a memory entry.

**Has** `text`, `origin`, `destination`, `route`.

`origin` is where it arrived from (`bar`, `telegram`). `source` is who created
the record. They were one field in v1 and confusing everybody.

`destination` is one of the eight in `DESTINATIONS`: `task`, `people`,
`finance`, `nutrition`, `health`, `goals`, `memory`, `appointment`. Validated
against that list, never trusted from the model.

`route` records **how** the destination was decided: `model` or `rules`. This
field exists because a silent fallback is a lie. Without it, an expired API
key looks like a model that quietly got worse, and you would not find out for
days.

**`text` and `route` never change once written.** `text` is the sentence kept
verbatim (rule 7); `route` is a historical fact about how the *original*
destination was decided, not the current one. **`destination` can change** —
see "Correcting a capture" below.

**Journal is deliberately not a destination.** Writing a diary is not a
sentence that got filed somewhere; it is its own act, with its own entity.

### Correcting a capture

Filing can be wrong, and the correction is a first-class action, not a silent
edit:

| Action | Removes | Survives |
| --- | --- | --- |
| **Undo** | the produced record (task/goal/appointment) and its links | the capture and its memory entry — the fact you said it stays true |
| **Refile** | same as Undo, then files into a new `destination` (a new record if that destination is `task`/`people`/`goals`) | the capture; `destination` is updated, `route` is not |
| **Delete** | everything the capture produced — capture, memory entry, produced record, links | nothing |

Undo only applies where there is a produced record to retract — today that
is `task`, `people`, `goals` and `appointment`; the other four destinations
have nothing for Undo to act on beyond Delete. Refile has no such
restriction: it works from any destination, including the four that file as
capture + memory only — there is simply nothing to retract before it creates
the new record. Refiling *into* `appointment` is one of those: the drawer has
no date/time input, so it only updates `destination` — same as refiling into
any of the four, and unlike refiling into `task`/`people`/`goals`.

Both are refused once the produced record has been touched since creation
(`completedAt` set, or `updatedAt !== createdAt`): the user's own work on that
record outranks a correction made from the capture log. Delete carries no such
guard — it is explicit and always available, which is also why it is the one
action that asks for confirmation first.

Each correction is its own event — `capture.undone`, `capture.refiled`,
`capture.deleted` — so nothing about it is silent. See
[ADR-0013](decisions/0013-a-capture-can-be-corrected-after-filing.md).

---

## Journal Entry

**Is** what you wrote, in your own words.

**Is not** structured, and not summarised. Several entries may share a day — a
morning thought and an evening one are two things, not a document to be
merged.

**Has** `date` (day key), `text`, `tags`.

**Never rewritten by the system.** The AI may propose extracting something
from it; the entry itself stays exactly as you typed it, forever retrievable.

---

## Memory

**Is** something the system claims to know.

**Is not** the journal, and not a copy of it. Memory is *derived*: the journal
entry or the capture stays the primary record.

**Has** `type`, `content`, `confidence`, `tags`, `validFrom`, `validUntil`.

**Types**

| type | Example |
| --- | --- |
| `fact` | "I have a Netflix subscription." |
| `preference` | "I prefer passive investing." |
| `decision` | "I decided not to buy a car this year." |
| `context` | "The Nordis contract is the priority this quarter." |
| `observation` | "Spent more than usual on restaurants for three months." |
| `event` | "Met Marco on 2 September." |

**The rule that keeps memory honest:** an entry whose `source` is not `user`
must carry a `derived_from` link to its origin. The store rejects it
otherwise. There are no orphan memories asserting facts with nothing behind
them, and deleting a memory never touches the writing it came from.

`validFrom` / `validUntil` exist because knowledge expires. A preference was
true from a date and may stop being true; without a window the system would
keep asserting it forever.

---

## Event

**Is** something that happened, at a time. The timeline is a query over these.

**Is not** the truth about state. An event points at the canonical entity
through `subject`; `payload` carries only what has no entity of its own, such
as a failed sync.

**Has** `type` (from `EVENT_TYPES`), `at`, `date`, `subject`, `payload`.

`date` is stored alongside `at` so a timeline can be queried by day without
every reader re-deriving it — and re-deriving it in the wrong timezone.

Append-only. Nothing edits an event.

---

## Task

**Is** a commitment, almost always owed to someone.

**Is not** a calendar event, and not a diary entry. It is the single entity
behind both the `task` and the `people` capture destinations: both file a
task, linked with `involves` to the person the sentence names (see "Naming a
person" under Person), and neither ever creates a person. There is no
separate "CRM item".

**Has** `title`, `note`, `band`, `bandSetOn`, `temperature`, `tags`,
`position`, `completedAt`.

**Bands**, most urgent first: `today`, `week`, `later`. Bands and not due
dates, because dated lists rot — everything slips and rescheduling becomes a
second job. A band answers the only question actually asked: how soon?

**`overdue` is not a band.** It is derived:

```
isOverdue(task, today) = band === 'today' && bandSetOn < today && !completedAt
```

`bandSetOn` is the day you chose the band, and it is what makes this work
without introducing due dates. Choosing a band resets it — even the band the
task already has — so moving something out of the overdue column does not
snap it straight back, and choosing `today` again for an overdue task
recommits it: "yes, today, really". Only `today` can go overdue: a `week`
task never promised a day.

**Tags are yours**, free-form and never a closed vocabulary: stored trimmed,
lowercased and each once, so "Billing" and "billing " are one tag.

**Transitions**
- Created in `today`, `week` or `later`. The store rejects `overdue` on
  create — being late is something that happens to a task, not a way to be
  born.
- Completing sets `completedAt` and writes a `task.completed` Event, once.
  It does **not** delete: the weekly review is made of exactly this
  material.
- Reopening clears `completedAt` and writes nothing: it corrects a
  completion, it is not something that happened to you.
- Deleting removes the task and its links, and nothing else — a capture
  that produced it keeps its sentence and its memory entry, and with no
  produced record left it can be refiled from the capture log again.

`position` orders a task within its band and is what dragging sets. It is the
third sort key, after band and temperature, for the three tasks the morning
shows.

---

## Appointment

**Is** a thing happening at a specific day and time, from a capture with an
explicit date and time or from a synced external calendar. The Calendar card
is a query over these.

**Is not** a `Task`: a task is a commitment with a band, never a due date,
because dated lists rot. An appointment is exactly a due date — that is what
puts it on the calendar and not the task list. It is also not an `Event`: an
event is a past-tense record of something that already happened, and an
appointment is usually in the future.

**Has** `title`, `date` (day key), `startTime`, `endTime?` — both `HH:MM`,
24-hour, no timezone, the same posture `lib/domain/dates.js` takes with day
keys — `calendarLabel` (free text, not a closed vocabulary: an external
calendar's name is not ours to constrain), `note` (yours; a sync never sets
it, the same posture a `Transaction`'s `note` takes), `confirmed` (a
boolean, true unless a sync dropped the appointment from the source but kept
it for its `note` or a link — see "Ownership on re-sync" below), plus the
four fields every canonical entity carries (`id`, `createdAt`, `updatedAt`,
`source` — this last one the closed `SOURCE_KINDS` list, same as everywhere
else, answering who created the record: `'capture'` for one filed from a
capture, `'integration'` for one a sync wrote). `origin`, an
`ExternalOrigin | null`, is set only by a sync — the same shape `Transaction`
and `FinanceAccount` already carry, with `externalId` inside it (the iCal
`UID`, plus the occurrence's `date` for a recurring series — the key a
re-sync matches against), not a field of its own.

**From a capture**, the classifier recognizes `appointment` only when the
text carries an explicit date *and* an explicit time — one without the other
falls through to whatever destination would otherwise have matched (usually
`task`), same as any other capture that names no destination clearly. The
rule-based fallback (no model configured) understands Italian only —
weekday names, `oggi`/`domani`/`dopodomani`, and an `alle HH[:MM]` time; the
model, when available, resolves the same in any language, given today's
date. The capture route writes the `Appointment`, an `about` link back to
the capture (the same shape `task`/`goals` get), an `appointment.created`
event (`EVENT_TYPES`), and — when the text names an existing `Person`, see
"Naming a person" under Person — an `involves` link from the appointment to
that person.

**From a sync**, `lib/integrations/google-calendar/` (kind `calendar` in
`INTEGRATION_KINDS`) parses the account's iCal feed and expands recurring
events over `limits.calendarWindowDays` (14 days from today). Only
`npm run sync:calendar` calls it — never a request handler (ADR 0010) — and
only that path ever reads `env.calendarIcalUrl`. An all-day or multi-day
event is skipped and logged, never forced into `date` + `startTime`; a
recurring event's occurrence gets its own `externalId`
(`<UID>#<occurrence day key>`), matching ADR 0014's rule for a recurring
series. Every run writes one `appointment.synced` event (`EVENT_TYPES`),
`payload` carrying `written`/`skipped` counts — once per run, not once per
record, the way a run reads as one line on the timeline rather than a burst
matching however many appointments it touched. `SyncState`
(`lib/store.js`'s `getSyncStates`/`updateSyncState`) is the complementary
record: what the *last* run did, kept current rather than appended to.

**Ownership on re-sync** (ADR 0014), extending the split ADR 0009 uses for
imported transactions: `title`, `date`, `startTime`, `endTime` and
`calendarLabel` belong to the source and are overwritten on every sync,
through `upsertAppointmentByOrigin` — never a plain `updateAppointment` with
a full row, the same rule ADR 0009 states for `upsertTransactionByOrigin`.
`note` and any `links` belong to the user; `updateAppointment` is the only
path that can touch them, and a sync never calls it for either. When a
previously-synced appointment's `externalId` is absent from a fresh sync
*and* its `date` falls inside the window this run actually asked the source
about, it is deleted — unless it carries a `note` or a link, in which case
`confirmed` is set to `false` instead and the record stays. A later sync
that sees the same `externalId` again sets `confirmed` back to `true`,
undoing the flag without ever touching the `note` or the links themselves.
An appointment whose `date` has simply aged past the window, or sits beyond
it, is left alone either way — this run never asked the source about it, so
its absence proves nothing.

**All-day and multi-day events are out of scope.** Neither fits `date` +
`startTime`; a sync skips them and logs what it dropped rather than forcing
them into a shape that misrepresents them.

---

## Person

**Is** someone tasks can be owed to, with enough context to prepare a call.

**Is not** a contact book. No pipeline, no deal, no stage.

**Has** `name`, `organization`, `kind`, `note`.

**Created by you, never by a capture** (ADR 0018). A capture only links a
person who already exists; a name it does not recognise links no one rather
than becoming a person, so a misspelling never becomes a duplicate. You add
one from the CRM panel's Person field — "Add '<name>'" — with the name alone;
organization, kind and note stay empty until you fill them.

**A task involves at most one person.** Choosing a person replaces the
`involves` link; clearing it removes the link. Neither touches the task, so
neither locks the capture it came from — which also means an Undo or Refile
of that capture takes the person you chose with it, and a Refile links
whoever the sentence names.

**Relations** tasks link to a person with `involves`. `getTasksForPerson()` in
the store is the named operation for the grouping view, so no component ever
writes that join itself.

**Naming a person.** A capture that links a person decides who the same way
on every path: the person the sentence names most completely — the most of
their name's leading words, as whole words and in any case. "Marco Rossi"
beats "Marco"; a first name alone counts for anyone who has it. A tie links
no one — a first name two people share, a one-word name that is also someone
else's first name, two people named in full — because a guess must never tie
a record to the wrong person. A name never matches inside another word
("Ann" is not in "annual").

---

## Goal

**Is** a promise you made yourself.

**Is not** a measurement, and this distinction is the entire reason goals are
stored on their own and never inside a daily log. "I read today" belongs to
today and resetting it tomorrow is correct. "Sign the contract this week" does
not stop existing on Monday morning. Attach a goal to a period and Monday it
silently disappears — not deleted, just stranded in last week where you will
never look. The damage is worse than a bug because it does not look like one:
it looks like a fresh start.

**Rule: goals never reset on their own.** You close them or you remove them.
There is no calendar logic anywhere near them, and there must not be.
`horizon` is a label you chose, never an expiry.

**Has** `name`, `kind`, `horizon`, `done`, `progress`, `targetDate`.

`kind: 'project'` is how a goal becomes a container for other work, with tasks
linked by `belongs_to`. Deliberately not a separate entity: a project is an
objective with children, and a second collection would earn nothing.

`progress` is a manual fallback. When a goal is linked to something countable,
progress should be derived instead.

---

## Habit

**Is** something you do every day, configured in the profile, not in code.

**Types** `check` (done or not) and `counter` (counted against a target).
The type is chosen once and **never changes** (ADR 0016): a check's history
is booleans and a counter's is numbers, so flipping it would not convert the
days already logged, it would reinterpret them. Change what you track by
archiving the old habit and adding a new one.

**Is ordered by its place in the list.** `profile.habits` is an array and
that array is the order — there is no `position` field the way a task has
one (ADR 0016). Reordering sends the whole order, which must be an exact
permutation of what the store holds.

**Is active over periods**, not flagged archived or not (ADR 0015). A period
is a half-open day-key range, `{ from, to }`: active from `from` up to but
not including `to`. Periods are ordered oldest first, non-overlapping, and
only the last may be open (`to: null`). "Archived" is derived — no open
period — the same shape `overdue` already takes. Archiving closes the
current period at today; restoring opens a new one. The gap in between
belongs to no period, so it never counts and is never mistaken for missed.

**Archiving keeps the history.** A habit counts, everywhere a habit number is
computed, only on the days it was active: nothing before its first period,
nothing in an archived-then-restored gap, everything else. Nothing is
deleted.

The **streak** counts backwards over consecutive days with at least one
*active* habit completed. A day still in progress does not break it —
breaking a streak at 00:01 would be punishing someone for waking up. It
is counted over the last 365 days, one window shared by every screen that
shows it, so the home card and the Habits screen can never disagree — the
Habits screen's thirty-day window does not cut it down (ADR 0017).

The **thirty-day summary** on the Habits screen averages completion over the
days that were *recorded*, and counts perfect days out of those same days —
an unrecorded day is not a zero, and averaging one in would make a week you
forgot to tick look like a week you failed. A day no habit was active on is
left out for the same reason (ADR 0017). **Days recorded** is the honest
denominator alongside it: how many of the thirty days there is anything to
average at all.

---

## Daily Log

**Is** one calendar day of measurements, keyed by day key.

**Is not** a place for anything that must survive the day.

**Has** `date`, `habits`, `meals`, `measurements`, `notes`.

`date` is `YYYY-MM-DD` **in the user's timezone**, produced by
`lib/domain/dates.js` and nowhere else (ADR 0005). A day that was never
written to reads back as an empty log rather than as missing, so callers can
tell "you recorded nothing" apart from "outside the window".

---

## Nutrition

**Is** the meals of one day, inside that day's log.

The four numbers are not independent: calories **are** the macros, at
4 kcal/g protein, 4 carbs, 9 fat. Change a macro and calories recompute
locally with the formula — where an exact formula exists, the formula beats
the model every time. Change calories and the model redistributes the macros,
because the formula alone has infinitely many solutions.

`estimated` marks a model guess and clears on any value corrected by hand.

---

## Health

**Is** the last N daily logs, aggregated. Almost entirely a view.

**Averages divide by recorded days only.** A day with no meals is a day you
did not record, not a day you did not eat. Counting it as zero would make
every skipped day flatter your deficit, and the card would congratulate you
for the days you ignored it. The functions return `recordedDays` so the number
carries its own reliability.

---

## Finance

Four entities, and the split between them is the most important thing in this
section.

### The stock and the flow

**Net worth cannot be derived from transactions.** Transactions are a flow;
net worth is a stock. A cash balance could be derived from transactions only
with a known opening balance and complete coverage — but an investment changes
value when the market moves and *no transaction happens at all*, and a pension
or a property never appears in a transaction list in the first place.

So: balances are **observed**, flows are **recorded**, and neither substitutes
for the other.

### FinanceAccount

**Is** where money sits. `kind` is `cash`, `investment`, `asset` or
`liability`, and net worth is `cash + investment + asset − liability`.

### FinanceObservation

**Is** what an account was worth at a moment, according to somebody.

**Has** `accountId`, `kind` (`balance` or `position`), `amount`, `currency`,
`date`, `observedAt`, `origin`.

An account with no observation is **unknown**, never zero. Treating it as zero
would quietly understate the position and nothing would say so.

### Transaction

**Is** money moving.

**Has** `date`, `amount`, `currency`, `description`, `kind`, `accountId`,
`counterAccountId`, `categoryId`, `note`, `origin`.

**Two zones of ownership, and getting this wrong is the classic sync bug:**

| Owned by the source | Owned by you |
| --- | --- |
| date, amount, currency, description, accountId, kind, origin | categoryId, note, links |

`upsertTransactionByOrigin()` rewrites the left column and never touches the
right one. That is what lets you recategorise a transaction inside PersonalOS
and re-run the import tomorrow without losing the work.

**`kind: 'transfer'` is the one that saves you from a wrong number.** Money
moved between two accounts you own is neither income nor spending, and
counting it doubles your monthly total. Every aggregation excludes it, and a
transfer without its `counterAccountId` is rejected — money with one end is
money vanishing.

**Amounts are integers in minor units** (cents). Floating point and money do
not belong in the same file. ADR 0009.

### NetWorthSnapshot

**Is** net worth on a date, with the components and the FX rates used.

**Is derived, and yet stored** — the single documented exception to rule 2.
The reason is that this is a history you cannot recompute: yesterday's market
value is gone tomorrow. Recomputing the series would quietly rewrite your past
every time you looked at it. The rates are stored with the snapshot for the
same reason. ADR 0008.

One snapshot per day: a second run the same day corrects the point rather than
adding a second one to the series.

### Categories are yours

`profile.financeCategories` lives in the data file, like habits, because your
categories are yours. The template ships a demo set in the seed; it does not
ship your business.

---

## Integrations

**SyncState** records what an integration did last time it ran: `lastRunAt`,
`status`, `error`, `itemCount`. It exists so a Sources view can say when
something last synced — a net worth that has not updated in nine days but
looks current is the same lie as a classifier that silently fell back to
keyword rules.

**ExternalOrigin** is on every synced record: `source`, `externalId`,
`syncedAt`, `sourceUpdatedAt`. The pair `(source, externalId)` is the
deduplication key. It is what makes an import idempotent, and what lets a live
source supersede a stale hand-entered row instead of sitting beside it and
double counting.

---

## Canonical vs derived — the register

| Canonical | Derived (never stored) |
| --- | --- |
| profile, habit definitions (including periods) | overdue, days overdue, a task's age, board column and By person group |
| finance categories | whether a habit is active/archived on a day |
| task title, note, band, bandSetOn, temperature, tags, position, completedAt | habit streak, completion ratio, per-habit rates, history heatmap cells, the thirty-day summary |
| people | health averages, day totals |
| goals | goal progress when metric-backed |
| journal entries | monthly spending, income by category |
| memory entries | current net worth |
| captures | days until deadline |
| links, events | |
| daily logs (ticks, meals, measurements) | |
| finance accounts, observations, transactions | |
| **net worth snapshots** — the one exception, see above | |

---

## Open questions

Recorded rather than answered, so nobody silently invents an answer:

1. A capture filed as `goals` — week or month horizon? Current intent:
   default to `week`, and let the classifier return a period when it can tell.
2. A capture filed as `health` needs a metric to land in. Weight is the
   obvious first one; the column gets built when the data exists, not before.
3. **Answered (ADR 0018):** a capture never creates a Person; it only links
   an existing one. Creating silently risked duplicates from spelling.
4. Whether a capture filed as `finance` should create a Transaction. Today it
   becomes a note on the day and a memory entry, and never touches net worth.
