# 0028. A question is asked on purpose, and never stored

- **Status** accepted
- **Date** 2026-10-12

## Context

The product has always promised two halves: say a thing once and it is filed,
and ask a question and it is answered from your own data. Only the first
exists. The capture bar's placeholder already says "or ask a question", and
building the second half (#170) forces two decisions the code cannot show.

The first is how a sentence becomes a question. The classifier could decide it
-- it already reads every sentence. But rule 2 is that capture never fails, and
a sentence mistaken for a question is a sentence lost: nothing files it.

The second is whether a question and its answer are kept. A capture is kept
because the original is never lost (rule 7). An answer is a different thing: it
is the model's reading of the data at one moment, and nobody confirmed it.

## Decision

**A question is asked on purpose.** The capture bar has an Ask toggle, and a
sentence starting with `?` turns it on; the `?` is a gesture and is not sent.
Without Ask on, a sentence is a capture, always, whatever it says. The bar
never chooses by content, and returns to capturing after every answer.

**A question and its answer are never stored.** Not as a capture, not as a
memory, not as an event. Asking writes nothing, and an answer never becomes a
memory.

**An answer rests on citations, checked against what was sent.** Every
statement cites a record, a computed figure or the profile. A statement that
cites nothing, or cites something the model was not shown, is dropped, and the
answer says it left something out. A citation's label and where it opens come
from the context, never from the model.

**An answer does no arithmetic.** A total is stated only by citing a computed
figure -- a number a screen already shows. One the system did not compute is
not stated.

## Consequences

- A sentence meant for filing cannot be lost to a misjudged classification. The
  price is one click, or one character, to ask.
- There is no history of questions and no way to re-read an answer: asking again
  costs one model call. That is the point -- an answer kept could be cited by a
  later answer, and the system would be quoting itself instead of your data.
  This is the same reason ADR 0027 does not store proposals.
- There is no follow-up thread: each question is checked against the data on
  its own.
- A figure is built for a screen first, and only then can an answer cite it.
  Spending per person or per tag is not citable until a screen shows it.
- No rule-based fallback exists. Nothing rule-based can answer a question
  honestly, so with no model the answer is "No model configured". This is the
  one place where rule 2 does not apply, because nothing is lost: the question
  was never a capture.
- Do not "improve" this by letting the classifier route questions, or by
  caching answers to save calls. Both reverse this decision.
