# 0068. The evening reminder is sent once a day, and its reply is that day's open answer

- **Status** accepted
- **Date** 2026-11-27

## Context

ADR 0037 makes the check-in the product, and nothing said that today's was
still open. Spec #285 asks for one message in the evening, and for a reply
to it to count as the check-in's open answer. ADR 0064 bounds what the
Telegram channel may send: fixed text, nothing of mine in a message the
system starts.

Three things had no home yet. Which message was a reminder, and of which
day -- a reply can arrive after midnight. How a reply delivered twice is
filed once. And what "open" means for the reminder, since the check-in's
open question never closes.

## Decision

- **A schedule, `evening-reminder`, at 21:30 every day, `same-day`.** Missed
  with the lid closed, it is sent on wake while it is still that day, and
  dropped after midnight: nobody is reminded about yesterday (ADR 0062).
- **It asks the check-in's own read**, `questionsFor(day).done`, which
  writes nothing. Done means every closed question answered; the open one
  never holds a check-in open. So a day with the closed questions answered
  gets no message, whatever the open one holds, and the run is `skipped`
  with `check-in-done`.
- **The text is fixed**: "Today's check-in is open." With
  `PERSONALOS_BASE_URL` set, the address follows on its own line; unset, no
  link. The address is configuration read in `lib/config/`, refused unless
  it is an http or https address. Nothing else can be put in the message:
  the sentences are plain strings and a test fails when one gains a slot.
- **The run says what it sent.** A run gains two optional fields, `about`
  (the day) and `messageId` (the channel's id of the message). They are
  present only on a run that sent a message and absent everywhere else, so
  no migration and no schema bump.
- **Never two for a day.** The schedule's slot already allows one run; the
  job also refuses when the run log holds an `ok` reminder about that day
  (`already-sent`), so a run started by hand does not send a second. A
  reminder that failed or was skipped does not count: the day may still get
  its one.
- **Channel off: `skipped`, `not-configured`**, with nothing read and
  nothing sent.
- **A reply to that message is the open answer of `about`'s day.** The loop
  tells its handler which message a text replies to; a reply whose target is
  a reminder in the run log is filed with `answerCheckin` on that day --
  the journal entry first, then the small model's read, as the dashboard
  does -- even after midnight. With the model down the entry stays.
- **Filed once per update.** The entry carries `telegram:<update id>` as its
  `clientId` (ADR 0033), given to `journal.add` through the action context.
  A redelivered update finds its entry and files nothing and reads nothing
  again. If the process died after the entry and before the read, the read
  is not made up later: the sentence is kept, which is the promise.
- **The bot confirms with a neutral line**, "Filed with that day's
  check-in.", and says so plainly when the check-in refused the answer.
- **The closed questions stay in the app.** Nothing but the open answer is
  filed from Telegram here.

## Consequences

- A reply to a reminder older than the run log's 90 days is no longer
  recognised as one; it is acknowledged like any other text.
- Two replies to the same reminder are two journal entries on that day, as
  two notes in the panel would be.
- The reminder is as alive as the laptop: closed all evening, it is not
  sent, by decision (ADR 0037).
- With the channel off the schedule still runs each evening and records a
  skipped run, as the calendar sync does with no calendar.
- The action context can now carry a `clientId`. Only `journal.add` reads
  it. It is not kept on the action record, so it plays no part in undo.
