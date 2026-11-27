# 0071. An answer in a chat is brief, and set out as points

- **Status** accepted
- **Date** 2026-11-27

## Context

ADR 0069 answers a question sent to the Telegram bot with the statements
the capture bar's panel shows, joined one to a line. The first real answer
was six lines for "what do I have to do tomorrow": today's task, an overdue
one, that nothing is set for tomorrow, and two habits that are due every
day. Each statement was true and cited. Together they were long, read as a
list of whatever was near the question, and ran straight into the note
about what was read.

The panel can afford that shape: each statement has its records beside it to
open, and the notes are set apart. A chat message has none of that.

## Decision

- **A question from a chat asks for a brief answer.** `ask(question, {
  brief: true })` adds `CHAT_BRIEF` to the question: the direct answer
  first, three statements at most unless a list is asked for, only what was
  asked, nothing merely related, routine or absent -- unless the answer is
  that there is nothing, said once. The capture bar does not send it.
- **It is said with the question, not in the system prompt.** The
  instructions every question shares stay byte for byte what ADR 0030
  measured. The line is about eighty tokens, inside that ADR's margin.
- **The limit is asked, not enforced.** Nothing cuts a fourth statement: a
  statement dropped by a count would be a silent cut. The checks of ADR 0028
  are unchanged.
- **The message has a shape.** One statement is a sentence. Several are
  points, one to a line, each after a bullet. What the reader must know
  about the answer -- something left out, months summarised, what was read
  (ADR 0070) -- comes after a blank line.
- Plain text, no markup: nothing in a statement can be read by Telegram as
  formatting.

## Consequences

- The same question may get fewer statements in the chat than in the bar.
  The bar is where the whole answer, with its records, is.
- How brief the answer is depends on the model following the line; a model
  that does not gives a longer message, never a wrong one.
