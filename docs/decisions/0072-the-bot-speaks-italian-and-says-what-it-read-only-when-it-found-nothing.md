# 0072. The bot speaks Italian, and says what it read only when it found nothing

- **Status** accepted
- **Date** 2026-11-27

## Context

The first real answer after ADR 0071 was three points for "what do I have to
do tomorrow". Two of them said the same thing -- nothing is set for
tomorrow -- in different words, and the whole answer fits one sentence.

Under it stood the note of ADR 0070, "Read only: tasks and days. Months:
...". That note exists so that "not in your data", said over part of the
archive, is not read as one over all of it. Under an answer that was found
it tells the reader nothing they can use, and it is the longest line of the
message.

It was also in English, like every fixed sentence of the bot, under an
answer in Italian: the model answers in the language of the question, and
the chat is written in Italian.

## Decision

- **No statement repeats another.** `CHAT_BRIEF` now also says: never say
  the same thing twice, every statement adds a fact no other holds, and when
  nothing matches what was asked and something close does, both go in one
  statement. Still asked of the model, not enforced: a statement is never
  dropped for being redundant.
- **What was read is said only under "not in your data".** `answerReply`
  adds the line when no statement survived and the question was asked over
  part of the archive. The capture bar's panel is unchanged: it shows the
  note under every such answer, set apart, where it costs nothing.
- **Every sentence of the bot is Italian**: `TELEGRAM_TEXTS`, the alerts,
  a capture's reply and the line about what was read (`readReply`, with
  `PART_NAMES` and `DESTINATION_NAMES` naming the closed lists). The rule of
  ADR 0064 stands: the fixed sentences hold no slot and no digit.
- **The app's screens stay in English.** The chat is a different surface
  with one reader; nothing here is a step towards translating the app.

## Consequences

- The language is fixed in the code, not configured. This is a single-user
  system; a second language would be a decision of its own.
- An answer found over part of the archive no longer says so in the chat.
  An answer that is wrong because the part was too narrow looks like any
  other; the same question in the app shows the note.
- A destination or a context part added to its list needs an Italian name:
  a test fails until it has one.
