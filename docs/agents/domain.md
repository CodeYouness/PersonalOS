# Domain Docs

How the engineering skills should consume this repo's domain documentation when
exploring the codebase. **Single-context repo** -- there is no `CONTEXT-MAP.md`
and no per-package context.

## Before exploring, read these

This project names its domain docs differently from the skills' defaults. The
equivalents here are:

- **`CLAUDE.md`** -- the non-negotiable rules. Short. Read it first, always.
- **`docs/domain.md`** -- the glossary: what the words mean, and the closed
  vocabularies. This is the repo's `CONTEXT.md`. **Do not create a `CONTEXT.md`
  that duplicates it.**
- **`docs/architecture.md`** -- layers and boundaries.
- **`docs/decisions/`** -- the ADRs. Not `docs/adr/`. Numbered `NNNN-slug.md`
  from `0000-template.md`. Read the ones that touch the area you are about to
  work in.
- **`docs/handoff/`** -- where the project actually is right now, including
  which findings from an old review are already fixed and must not be re-fixed.

`personalos.config.js` holds the closed vocabularies themselves -- destinations,
link relations, event types, memory types, bands. A term that belongs to one of
those lists is defined there and documented in `docs/domain.md`; the two must
agree.

## Use the glossary's vocabulary

When your output names a domain concept -- an issue title, a refactor proposal,
a hypothesis, a test name -- use the term as defined in `docs/domain.md`. Don't
drift to synonyms the glossary avoids.

If the concept you need isn't in the glossary yet, that's a signal: either
you're inventing language the project doesn't use (reconsider), or there's a
real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than
silently overriding:

> _Contradicts ADR-0006 (relations live in links) -- but worth reopening
> because..._

A new decision gets a new ADR in `docs/decisions/`, written in the style of the
ones already there. Per `CLAUDE.md`: never leave the spec saying A, the docs
saying B and the code doing C.
