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
out: Haiku 5.5 already costs about a twentieth of Sonnet on input, and a
second provider means an adapter, a second key and a second output to
validate.

## Decision

**Each call type -- `classify`, `extract`, `answer` -- has its own model.**
It comes from its own variable, `ANTHROPIC_MODEL_CLASSIFY`,
`ANTHROPIC_MODEL_EXTRACT` or `ANTHROPIC_MODEL_ANSWER`, and falls back to its
entry in `defaultModels` in `personalos.config.js`. A blank variable counts as
unset.

**There is no variable for all three.** `ANTHROPIC_MODEL` is no longer read.
An override for all three would let one leftover line quietly undo the split,
and the split is the point.

The defaults are `claude-sonnet-5-5` for all three until a fixed set of
sentences has scored the classifier on a cheaper model (#197); moving them is
its own change (#198), recorded here when it lands.

## Consequences

- A call type can move to a cheaper model, or back to a stronger one, without
  touching the other two -- and without a code change.
- Every new model call names its call type. A fourth one adds an entry to
  `defaultModels` and a variable, not a reuse of an existing one.
- An `.env.local` that still sets `ANTHROPIC_MODEL` changes nothing, silently.
  The development guide says so; the sandbox banner shows the models actually
  in use.
- Model ids belong to the provider. They are configuration values, not a
  closed vocabulary: nothing validates them at the store boundary, and a
  retired id fails at the call, where capture falls back to the rules (rule 2).
