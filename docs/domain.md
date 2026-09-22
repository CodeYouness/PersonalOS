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

`destination` is one of the seven in `DESTINATIONS`: `task`, `people`,
`finance`, `nutrition`, `health`, `goals`, `memory`. Validated against that
list, never trusted from the model.

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
| **Undo** | the produced record (task/goal) and its `about` link | the capture and its memory entry — the fact you said it stays true |
| **Refile** | same as Undo, then files into a new `destination` (a new record if that destination is `task`/`goals`) | the capture; `destination` is updated, `route` is not |
| **Delete** | everything the capture produced — capture, memory entry, produced record, links | nothing |

Undo only applies where there is a produced record to retract — today that
is `task` and `goals`; the other five destinations have nothing for Undo
to act on beyond Delete. Refile has no such restriction: it works from any
destination, including the five that file as capture + memory only — there
is simply nothing to retract before it creates the new record.

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
behind both the `task` and the `people` capture destinations: those differ in
whether a person is linked, not in kind. There is no separate "CRM item".

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
without introducing due dates. Moving a task to a band resets it, so dragging
something out of the overdue column does not snap it straight back. Only
`today` can go overdue: a `week` task never promised a day.

**Transitions**
- Created in `today`, `week` or `later`. The store rejects `overdue` on
  create — being late is something that happens to a task, not a way to be
  born.
- Completing sets `completedAt` and writes an Event. It does **not** delete:
  the weekly review is made of exactly this material.

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
calendar's name is not ours to constrain), plus the four fields every
canonical entity carries (`id`, `createdAt`, `updatedAt`, `source` — this
last one the closed `SOURCE_KINDS` list, same as everywhere else, answering
who created the record: `'capture'` for one filed from a capture,
`'integration'` for one a sync wrote). `origin`, an `ExternalOrigin | null`,
is set only by a sync — the same shape `Transaction` and `FinanceAccount`
already carry, with `externalId` inside it (the iCal `UID`, plus the
occurrence's `date` for a recurring series — the key a re-sync matches
against), not a field of its own.

**Ownership on re-sync**, extending the split ADR 0009 uses for imported
transactions: `title`, `date`, `startTime`, `endTime` and `calendarLabel`
belong to the source and are overwritten on every sync. A `note` and any
`links` will belong to the user and never be touched by one, the same as a
transaction's — that field lands with whichever ticket first gives an
appointment a way to be annotated. See ADR 0014 for what happens when the
source stops mentioning an appointment the user annotated.

**All-day and multi-day events are out of scope.** Neither fits `date` +
`startTime`; a sync skips them and logs what it dropped rather than forcing
them into a shape that misrepresents them.

---

## Person

**Is** someone tasks can be owed to, with enough context to prepare a call.

**Is not** a contact book. No pipeline, no deal, no stage.

**Has** `name`, `organization`, `kind`, `note`.

**Relations** tasks link to a person with `involves`. `getTasksForPerson()` in
the store is the named operation for the grouping view, so no component ever
writes that join itself.

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

**Archiving keeps the history.** An archived habit stops appearing today and
still shows in the days it was active. Nothing is deleted.

The **streak** counts backwards over consecutive days with at least one habit
completed. A day still in progress does not break it — breaking a streak at
00:01 would be punishing someone for waking up.

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
| profile, habit definitions, finance categories | overdue, days overdue |
| task title, note, band, bandSetOn, temperature, tags, position, completedAt | habit streak, completion ratio, per-habit rates |
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
3. Whether `people` should create a Person when the name is new, or only link
   an existing one. Creating silently risks duplicates from spelling.
4. Whether a capture filed as `finance` should create a Transaction. Today it
   becomes a note on the day and a memory entry, and never touches net worth.
