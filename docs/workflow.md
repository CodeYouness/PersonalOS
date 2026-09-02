# Workflow

How a substantial change gets made here. Small fixes do not need this; anything
that touches a boundary, adds a card, or changes what a word means does.

```
idea
 |
 v  clarification -- what exactly, and what is out of scope
 |
 v  specification -- the behaviour, in docs/spec.md terms
 |
 v  small tickets -- each independently verifiable
 |
 v  implementation
 |
 v  tests
 |
 v  review -- read the diff as if someone else wrote it
 |
 v  documentation and ADR
 |
 v  commit
```

## The steps that people skip

**Clarification before specification.** "Add subtasks" is not a request, it is
a direction. Which screens change? What happens to an existing task? One level
of nesting or many? Answer these before writing code, not during.

**Tickets before implementation.** A ticket is one thing that can be verified
on its own. "Build the CRM" is not a ticket; "Kanban with drag between bands,
positions persisted" is.

**The ADR.** Write one when a future reader would otherwise look at the code
and think "that is strange" -- and change it. Do not write one for choices that
explain themselves.

## For an agent picking this up cold

1. Read `CLAUDE.md`. It is short and holds the rules that are not negotiable.
2. Read the relevant part of `docs/architecture.md` and `docs/domain.md`.
3. Check `docs/decisions/` for a decision that already covers the area.
4. Propose the plan **before** editing. Name the modules involved.
5. Implement, then `npm run verify`, then check the behaviour for real.
6. Update the docs if a behaviour or a word changed. Add an ADR if a new
   decision was made.
7. Read `git diff` in full.
8. Commit with a scope, one coherent change per commit.

## Agent skills

`.claude/skills/` and `.claude/commands/` are where repeatable procedures go --
specification, ticketing, code review, domain modelling, architecture review,
debugging. They are deliberately empty right now: a procedure earns a file once
it has been done by hand a couple of times and proved worth repeating. Adding
nine speculative skills would be the same mistake as adding nine speculative
abstractions.
