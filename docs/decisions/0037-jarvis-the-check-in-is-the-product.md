# 0037. Jarvis: the check-in is the product

- **Status** accepted
- **Date** 2026-11-12
- **Supersedes in part** [0028](0028-a-question-is-asked-on-purpose-and-never-stored.md), [0030](0030-each-model-call-has-its-own-model.md)

## Context

PersonalOS was built capture-first: say a thing once and the system files it.
The foundations are sound -- the pure domain, the derivations, the store
contract, the capture pipeline with rules underneath the model -- but an audit
of the code against real use found the product behind them barely used. The
cost was never the architecture. Recording is work the system does not repay,
it never comes to you, nothing runs on its own, and a sentence can only land in
one place.

The wish was a "Jarvis": voice-first, agentic, built around Claude Code and
its skills. Taken literally that is a rewrite and a third round of foundations
for a product nobody opens. The question this record answers is what Jarvis is
*for*, and what the least is that has to change to get there.

## Decision

**The daily check-in is the product.** Once a day, in under three minutes,
the system asks a few questions and files the answers. Everything else --
dashboard, skills, voice -- is built after it and judged by whether it gets
used.

- **Questions are computed from the data, without a model**: habits scheduled
  and not ticked, a past appointment, mood and energy not yet given, plus one
  open question. Loading the page that shows them calls nothing (rule 3).
- **One answer may produce several records.** The answers are filed at once
  and shown as one receipt, one line per record, each undoable. There is no
  "confirm?" during the check-in.
- **The open answer is a journal entry**, kept word for word; records drawn
  from it link back to it (rule 7).
- **Mood and energy**, each 1 to 5, replace the single day rating (ADR 0035);
  existing ratings become mood. A short validated wellbeing scale is asked
  once a month.
- **A habit is read by its rate, not the global streak**, and a scheduled day
  missed takes a skip reason in one tap.
- **Time is declared**, in half hours, against a short list of areas.
- **For an account that has statements, the statements are its transactions.**
  A spoken expense is for cash and accounts without one, so a month is never
  counted twice.

**The coach.** Jarvis pushes on commitments you made, cites your data for
every push, and proposes rather than reproaches: no loss-aversion nudges.
It compares descriptively and always states the number of days; it says
"causes" only about an experiment you declared. It reads the journal only on
your command, and what it writes is an observation you keep or discard.

**How it is built.**

- **An action registry.** Every write an agent or a channel can make is a
  named action with a schema, a risk class and an undo. Reversible, low-risk
  actions run at once; the rest are proposals you accept. No action reaches
  outside the system.
- **A three-tier router.** Rules and closed answers, with no model; a small
  model behind a provider interface, returning a list of actions; Claude Code
  for the skills that declare it, **only on your command**, never on a
  schedule. The sentence is saved before any tier runs.
- **Skills** are folders holding a `SKILL.md`, with a trigger, an optional
  schedule and an engine. Every run is recorded: who started it, engine,
  duration, cost, outcome, what it wrote.
- **One writer process**, hosting the scheduler and every channel, and
  movable to another machine by copying a folder (ADR 0011, 0032 stand).
- **Channels.** The dashboard first. Telegram to come and find you, for light
  data only; its servers keep an unread message 24 hours, so the phone's
  queued Shortcuts stay the capture path that cannot lose a sentence.
- **Storage.** The JSON store now; SQLite with full-text search behind the
  same adapter contract when search is needed. The journal's truth is in the
  store, mirrored to Markdown; generated documents are files. Personal data,
  documents and personal skills live outside this public repository.
- **Five places**: Today, Journal, Review, Money, Jarvis. The CRM becomes a
  list of commitments in Today; habits are ticked in Today and read in Review.

**What this supersedes.** ADR 0028's "a question is asked on purpose, never
guessed" no longer holds for routed input: the router decides intent from
content. Rule 2 holds because the original sentence is always saved first, so
a wrong route files badly and loses nothing. The rest of 0028 stands: an
answer rests on checked citations and does no arithmetic. ADR 0030's rejection
of a second provider is withdrawn; a model per call type stands. Rules 2 and 3
are unchanged.

**Process.** An ADR is written only for a choice that is hard to reverse. A
product question is settled by a prototype used for a week, not by a spec.

## Alternatives considered

- **Everything in an Obsidian vault.** Markdown cannot hold money in minor
  units, typed links, idempotent imports or concurrent writers. It stays a
  viewer over a folder.
- **A rewrite, or another language.** It would discard the tested domain and
  the adapter contract, the best part, for no architectural gain.
- **Always-listening voice with a wake word.** The costliest piece and the
  least used; push-to-talk and voice notes first.
- **A local model by default.** It saves a few dollars a year and costs
  memory on the one machine. It is an experiment, adopted only if the eval
  says it matches.
- **WhatsApp.** A bot that writes first needs a business account and approved
  templates.

## Consequences

- The capture route's hand-written filing becomes the first users of the
  action registry; single-destination capture is a list with one action.
- The three direct SDK imports move behind one provider interface, and the
  classifier's eval grows multi-record sentences before the check-in ships.
- A model now writes text that is kept, as an observation. It is kept only
  after you accept it, the same shape as ADR 0027's proposals.
- Scheduled work uses scripts and the small model only. A scheduled reading
  by the strong model would need a metered API key for that one skill.
- With the laptop closed, reminders and syncs do not run and a Telegram
  message older than a day is gone. An always-on host is decided after the
  channel has been used, not before.
- Frozen, not deleted: the CRM's temperature and by-person view, calorie
  tracking, the one-off importers.
- Do not "restore" the Ask toggle as the only way to ask, or route a capture
  before saving it. The first reverses this decision; the second breaks rule 2.
