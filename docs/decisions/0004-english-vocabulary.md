# 0004. English identifiers, English interface

- **Status** accepted
- **Date** 2026-09-01

## Context

The source guide is in Italian and names several domain concepts in Italian --
`profilo`, `catture`, `persone`, `obiettivi`, `memoria` -- while its code
examples are in English. Following it literally produces a half-Italian,
half-English vocabulary, which is exactly the kind of thing that rots: within
months nobody remembers which half a given concept belongs to, and an AI agent
has to guess on every new symbol.

The project is meant to be cloned and modified by other people.

## Decision

Identifiers, file names, comments, documentation and user-facing strings are in
English throughout.

The capture destinations map one to one onto the guide's list:

| Guide | Here |
| --- | --- |
| task | `task` |
| persone | `people` |
| finanze | `finance` |
| nutrizione | `nutrition` |
| salute | `health` |
| obiettivi | `goals` |
| memoria | `memory` |

Similarly: urgency bands `overdue` / `today` / `week` / `later`, temperatures
`hot` / `warm` / `cold`.

## Consequences

- Pasting a prompt from the guide produces Italian names. Translate them using
  the table above; do not introduce a second vocabulary alongside this one.
- `docs/domain.md` is the authority on what each word means. A term that is not
  in it does not exist yet.
- Adding a language later is an i18n layer over the interface strings, and does
  not touch identifiers.
