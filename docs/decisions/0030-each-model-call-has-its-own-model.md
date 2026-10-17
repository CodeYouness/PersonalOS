# 0030. Each model call has its own model

- **Status** accepted
- **Date** 2026-10-15

## Context

Three things in PersonalOS call the model: filing a capture (`lib/classify.js`,
Refile included), reading one journal entry for what is worth remembering
(`lib/extract.js`), and answering a question (`lib/answer.js`). All three read
one variable, `ANTHROPIC_MODEL`, which was unset, so all three ran on the
fallback `claude-sonnet-5`.

They do not need the same thing. Filing is a pick between closed destinations
plus a calorie estimate, on a sentence of a few dozen characters, and happens
every time a sentence is typed. Answering is long reasoning over up to
300,000 characters of context, where every statement must cite a record. A
question costs around thirty captures.

With one variable, making captures cheaper moves answers too, and keeping
answers on a stronger model keeps captures expensive. Three ways out:

- one variable, set to the cheapest model that answers well enough -- the
  weakest call decides for all three;
- one variable per call type, with `ANTHROPIC_MODEL` kept as an override for
  all three;
- one variable per call type, and no override for all three.

A second provider (an open model behind a router) was considered and left
out: Haiku 5.5 already costs about a twentieth of Sonnet on input (the
official pricing page, read 2026-10-11), and a second provider means an
adapter, a second key and a second output to validate.

## Decision

**Each call type -- `classify`, `extract`, `answer` -- has its own model.**
It comes from its own variable, `ANTHROPIC_MODEL_CLASSIFY`,
`ANTHROPIC_MODEL_EXTRACT` or `ANTHROPIC_MODEL_ANSWER`, and falls back to its
entry in `defaultModels` in `personalos.config.js`. A blank variable counts as
unset.

**There is no variable for all three.** `ANTHROPIC_MODEL` is no longer read.
An override for all three would let one leftover line quietly undo the split,
and the split is the point.

The defaults stayed `claude-sonnet-5` for all three -- the model every call
already ran on -- until a fixed set of sentences had scored the classifier on
a cheaper model (#197); moving them was its own change (#198), recorded
below. They are not `claude-sonnet-5-5`: it refuses a forced `tool_choice`,
which every one of the three calls uses, so as a default it would have
failed them all. The first run of #197 found it.

## Consequences

- A call type can move to a cheaper model, or back to a stronger one, without
  touching the other two -- and without a code change.
- Every new model call names its call type. A fourth one adds an entry to
  `defaultModels`, its variable in `readModelSettings` and the `Models`
  type -- never a reuse of an existing one.
- An `.env.local` that still sets `ANTHROPIC_MODEL` changes nothing, silently.
  The development guide says so; the sandbox banner shows the models actually
  in use.
- Model ids belong to the provider. They are configuration values, not a
  closed vocabulary: nothing validates them at the store boundary, and a
  retired id fails at the call, where capture falls back to the rules (rule 2).
- A model chosen for a call type must accept a forced `tool_choice`. Not all
  do; `npm run eval:classify` says so in one line before anything moves.

## A question stays under the 100K-token price step (#204, 2026-10-17)

Above 100,000 prompt tokens, Haiku 5.5 charges five times as much -- $0.50 /
$2.50 instead of $0.10 / $0.50 per MTok -- on the whole prompt, not on the
part over, and cached reads and writes count toward the length. Nothing
errors; the bill jumps. The question context was limited to 300,000
characters, a figure from an older tokenizer ("about 75k tokens"). Before
`answer` can move to Haiku (#198), a full question has to fit under the step.

**Measured** with `npm run measure:context` on `claude-haiku-5-5`, 2026-10-17,
on made-up records built by the context builder and sent in the request the
answer module sends:

| What is sent | Tokens a character |
|---|---|
| transactions as the sheet import writes them (the worst mix today) | 0.488 |
| Italian journal text and memories | 0.471 |
| the seed's own context | 0.414 |
| transactions with upper-case bank-statement lines (no importer writes these yet) | 0.536 |

The fixed part of a question -- instructions, tool, a short question and an
empty context -- is 1,438 tokens. At 300,000 characters a full question would
have been over 150,000 tokens.

**The limit goes down to 170,000 characters, and still counts characters.**
At 0.52 tokens a character and a 1,500-token fixed part, a full question is at
most 89,900 tokens: ten thousand below the step. 0.52 sits above every mix an
importer writes today; a bank import with statement lines would measure about
0.54 and land near 92,000 -- over the ceiling, still under the step -- so a
new importer re-measures before it lands. Counting tokens would be exact, but
it needs a model call on every question to size a context that is built
without one (rule 3); characters are measured on the same string that is
sent, for free. Today's archive is about a fifth of the limit, and how a
context is summarised or refused does not change (ADR 0028).

`tests/lib/context-limit.test.js` holds `contextMaxChars × 0.52 + 1,500 ≤
90,000`, so raising the limit cannot cross the step unnoticed. When the answer
model or a kind of record changes, `measure:context` is run again and the two
constants move with what it prints.

## The defaults move to Haiku 5.5 (#198, 2026-10-17)

**All three defaults -- `classify`, `extract` and `answer` -- are
`claude-haiku-5-5`.** Each can still be moved back with its own variable.

The first run of `npm run eval:classify`, 2026-10-15, on 32 made-up sentences
(PR #200):

| Field | Haiku 5.5 | Sonnet 5 |
|---|---|---|
| sentences filed right | 28 / 32 | 29 / 32 |
| destination | 29 / 32 | 29 / 32 |
| date | 14 / 14 | 14 / 14 |
| startTime / endTime / time | 4/4, 1/1, 1/1 | 4/4, 1/1, 1/1 |
| calories | 5 / 6 | 6 / 6 |
| protein / carbs / fat | 4/4, 2/2, 3/3 | 4/4, 2/2, 3/3 |
| weight | 4 / 4 | 4 / 4 |
| amount / direction / categoryId / account | 7/7, 6/6, 5/5, 1/1 | 7/7, 6/6, 5/5, 1/1 |
| **cost per capture** | **$0.000217** | **$0.004520** |

Haiku costs about a twentieth as much a capture. Its one extra miss is a
calorie estimate scored against a hand estimate with no source. **Both models
miss the same three sentences** -- two facts about a person filed as `people`
instead of `memory`, and a lift filed as `goals` -- so the cause is the prompt,
which names the destinations without saying what they mean, not the model.
That is its own change (#203).

`extract` and `answer` were not scored by a set of their own. They move with
`classify` because each forces one tool whose output is checked before
anything is stored or shown, a question now fits under Haiku's price step
(#204, above), and a call type that turns out worse moves back with its
variable, without a code change.
