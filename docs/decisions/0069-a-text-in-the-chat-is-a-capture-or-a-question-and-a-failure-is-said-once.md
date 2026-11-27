# 0069. A text in the chat is a capture or a question, and a failing schedule says so once

- **Status** accepted
- **Date** 2026-11-27

## Context

ADR 0064 built the channel and left a text that is not a reply to a
reminder acknowledged and filed nowhere. Spec #285 asks for that text to
take the capture bar's path with origin `telegram` -- filed as a capture or
answered as a question, with no command to remember -- and for a schedule
that breaks to tell me once.

Three things had no answer.

**Where "the capture bar's path" is.** Everything a capture does after it is
checked lived in the route handler of `POST /api/capture`. The channel is not
a route and may not be imported by one; calling its own server over HTTP
would put the channel behind the phone gate for no reason.

**What makes a text a question.** The bar never decides: it has an Ask mode,
and ADR 0028 says the route never judges whether a sentence "is" a question.
A chat has no mode.

**Where the alert state lives.** "Told once, then nothing until it succeeds"
sounds like a flag to store.

## Decision

- **One entry point, in `lib/`.** The filing moves, unchanged, from the
  route into `fileCapture` (`lib/capture.js`). The route checks what it was
  sent and calls it; the channel's handler calls it with origin `telegram`.
  One classifier, one way a sentence is filed, and the rule-based floor
  under the model comes with it: capture from Telegram never fails either.
- **The update id is the capture's `clientId`**, as `telegram:<update id>`
  (ADR 0033: one capture per origin and id). An update Telegram delivers
  again files nothing and asks no model, and is answered with the first
  reply. This closes ADR 0064's known gap, the acknowledgement sent twice.
- **A text that ends with a question mark is a question; everything else is
  a capture.** The question mark is the chat's Ask mode: something I type on
  purpose, not something a model guesses. No model call decides it, so a
  capture costs what it costs from the bar and a dead model cannot turn a
  sentence into an unanswered question.
- **A question is answered as the bar answers it** (`answerQuestion` over
  the same context) and stored nowhere, as from the bar. A question the
  model did not answer gets a fixed line and is not filed: it was not a
  capture, and it is still in the chat to send again.
- **What the replies say.** A capture's reply names the destination and
  nothing else -- no sentence, no title, no amount: "Filed under finance."
  A question's reply is the answer's statements, and may carry data,
  because it was asked for in that chat. Both are replies; neither is ever
  sent unasked.
- **The alert rule is a derivation**, `failureAlert` in
  `lib/domain/derive/run-alerts.js`, over one schedule's runs: the newest
  run failed, and the run before it that was not skipped had not. A skipped
  run did not try, so it is read past: `failed, skipped, failed` is one
  failure. Nothing is stored.
- **It is asked after a run is recorded.** The scheduler takes an
  `afterRun`; the real one (`lib/scheduler/start.js`) gives it the alerter
  (`lib/scheduler/alerts.js`). Only a schedule's runs alert: the channel's
  own runs are in the same log and are skipped.
- **An alert is a fixed sentence per schedule.** "Naming the schedule" with
  one template and a slot would be a slot. So `ALERT_TEXTS` holds one
  sentence for each schedule id, and `NEEDS_LOGIN_TEXTS` the broker's own
  for an expired login. `alertText(scheduleId, kind)` takes nothing else:
  the run and its error cannot reach it. A test fails when a schedule has no
  sentence, and when any unsolicited sentence holds a placeholder character
  or a digit.
- **`features.telegramCapture` is on.**

## Consequences

- A sentence that ends with a question mark and was meant as a note is asked
  of the model and not filed. The reply makes that visible at once, and the
  sentence is still in the chat.
- A question that Telegram delivers twice after a crash is asked twice:
  nothing is filed from it, so there is nothing to recognise it by.
- A capture's reply cannot be used to check an amount or a title. That is
  the price of a notification that says nothing about me; the app shows it.
- An alert that could not be sent is not sent later: the next failure is the
  second of its streak. The failure is in the run log either way. The case
  is the one where Telegram itself is unreachable.
- A sync run by hand from a script alerts nobody -- it is read on the
  terminal -- but its run counts: a scheduled failure after a manual failure
  is the second.
- With the channel off the alerter sends nothing and asks nothing.
- Adding a schedule now means adding its alert sentence, or a test fails.
- `formatEuro` moved to `lib/domain/format.js`, since the receipt is written
  in `lib/`; `components/format.js` re-exports it.
