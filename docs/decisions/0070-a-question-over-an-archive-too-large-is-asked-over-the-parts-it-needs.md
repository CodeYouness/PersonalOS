# 0070. A question over an archive too large to send whole is asked over the parts it needs

- **Status** accepted
- **Date** 2026-11-27

## Context

ADR 0028 sends a question the whole archive: every record a screen shows,
then every computed figure. ADR 0030 holds what is sent under
`limits.contextMaxChars` (170,000 characters, about 90,000 tokens), because
past 100,000 prompt tokens the small model costs five times as much. Over
the limit, old transactions give way to their monthly figures; still over,
the question is refused as **too large** and nothing is sent.

With the real statements imported the archive is about 570,000 characters
after everything that may be summarised is. Every question was refused, from
the capture bar and from Telegram alike, including "what is due tomorrow",
which needs none of what made the archive large: transactions (about
258,000), the monthly totals by category (145,000) and price history
(119,000). The honest refusal had become the only answer.

Raising the limit pays five times as much for every question and is passed
again by the next year of statements. Cutting the archive by some fixed
order makes "not in your data" a lie whenever the answer was in what was
cut.

## Decision

- **An archive that fits is asked whole**, with one call, exactly as before.
  Nothing below happens to it.
- **One that does not fit is asked a part at a time.** The context has five
  parts, a closed list, `CONTEXT_PARTS`: `life` (everything that is not
  money), `money` (accounts, net worth, a month's totals), `categories` (a
  month's totals by category and tag), `transactions` (the single
  movements), `investments` (trades, prices, the investment figures). Which
  item is in which part is `partOf`; a kind nobody listed is `life`, so a
  new kind of record is read, never dropped.
- **The small model chooses the parts, from the question alone.**
  `chooseParts` sends the classify model the question, today's date and
  what each part holds, and none of the data. It answers with parts from
  the closed list and, when the question names a period, a first and a last
  month. Its answer is checked (`resolveRead`): a part that is not one is
  dropped, months that are not two months in order give way to the newest
  `limits.contextRecentMonths`.
- **Months bound what belongs to a month**: a transaction, by its date; a
  monthly figure, by the month in its id. Everything else of a chosen part
  is sent whatever the months.
- **The budget still holds, and still summarises.** The narrowed context is
  fitted as the whole one is, except that only the newest month of the
  chosen ones is owed in full. Still over: too large, as before.
- **The answer says what was read.** The context carries `read` (the parts
  and the months), the model is told that everything else was not read and
  is unknown, never absent or zero, and the answer carries `read` to the
  panel and to the chat: "Read only: tasks and days. Months: September 2026
  to November 2026." So "not in your data" over a part is never taken for
  one over everything, and a wrong choice of parts shows.
- **No choice, no question.** A small model that does not answer, or names
  no part, leaves the question refused as too large: what it would have
  been without this.
- **One entry point**, `ask(question)` in `lib/answer.js`, for the route and
  for the Telegram channel. Choosing is the answer module's work: the
  context layer still never calls a model.

## Consequences

- A question over a large archive costs a second, small call: the question
  and a few hundred tokens of instructions, a few words back.
- The choice can be wrong. Then the answer is "not in your data" with what
  was read beside it, and the question can be asked again naming what it
  is about. It is never a wrong number: the model answers only from what it
  was sent, and a citation of a record that was not sent is still dropped.
- On the real archive (2026-11-27): `life` is about 50,000 characters,
  `money` 19,000, `categories` 30,000 for three months and 135,000 for the
  year, `transactions` 120,000 for three months, `investments` 138,000.
  `money` with `categories` over the whole year is just over the limit and
  is refused: the remaining "too large". It goes away when the totals by
  category are written more compactly, which is a change to the figures and
  their ids, not to this.
- A statement that needs two large parts at once (every movement and every
  price) is refused. That is the limit doing its job.
- The serialised context gains `read` only when it holds a part, so a whole
  context is byte for byte what it was, and the measurements of ADR 0030
  stand. What the model is told about a part is counted in the budget.
- ADR 0028's "the route never decides whether a sentence is a question"
  stands: the small model chooses what to read, not whether to answer.
