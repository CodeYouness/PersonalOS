# 0018. A capture never creates a person; only you do

- **Status** accepted
- **Date** 2026-09-22

## Context

A capture filed as `task` or `people` becomes a task, and the CRM screen
answers "who is waiting on me" through that task's `involves` link. The
glossary had left one question open since v2: when a sentence names someone
PersonalOS does not know, should the capture create that Person, or only link
one that already exists?

Creating is tempting -- every new name would land somewhere. But a capture is
one sentence, typed or spoken in a hurry, and names in hurried sentences are
spelled however they come out: "Federico", "Fede", "Federico R.". Each
spelling would become its own person, the tasks owed to one human would
scatter across three, and nothing would say so. Merging duplicates is a
feature nobody wants to build or run.

At the same time, the CRM screen is useless if people can only come from the
seed. Somebody has to be able to create them.

## Decision

A capture only ever links a person who already exists, through the shared
matcher (`personNamedIn`): whoever the sentence names most completely, and no
one on a tie. A name it does not recognise links no one. The capture and its
task are still filed; only the link is missing.

A person is created by you, deliberately: the CRM detail panel's Person field
(#55) offers "Add '<name>'" for a name you typed, and creates a person with
that name and nothing else.

## Consequences

- A sentence naming someone new files a task with no person, which you link
  from the CRM panel -- one extra step, taken once per person.
- The same name can reach the store twice only if you add it twice, by hand.
- A future reader must not "improve" capture by creating the person it could
  not find: that is the duplicate factory this ADR exists to keep out. Making
  new names easier to act on -- say, suggesting "Add 'Federico'" beside an
  unlinked task -- is fine, as long as you are the one who says yes.
