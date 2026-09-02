# 0006. Relations live in a link collection

- **Status** accepted
- **Date** 2026-09-02

## Context

Foundation v1 had exactly one relation, `task.personId`, and no way to express
any other. The system is meant to represent a life, where the interesting
things are connections: a task serving a goal, a purchase funding it, a
journal entry about a person, a memory extracted from that entry.

Two ways to add them.

**A field per pair.** `task.goalId`, `habit.goalId`, `transaction.goalId`,
`memory.journalId`. Concrete and fast to read, but with ten entity types and
many-to-many needs it is N² decisions and a schema change every month. It also
puts the write for "these two things are related" inside one of the two
entities, which is wrong when a model proposes the link with a confidence.

**A single edge collection.** One place, one shape, one query.

The objection to the second is real: an edge list is the generic solution, and
generic solutions rot into free-form strings.

## Decision

A single `links` collection: `{ id, from, to, rel, confidence, createdAt,
source }`. No entity holds a reference to another; `task.personId` is removed.

The rot is prevented by a **closed vocabulary**. `rel` must be one of
`LINK_RELS` in `personalos.config.js` — five to begin with — and the store
rejects anything else. Adding a relation means editing config and documenting
it in `docs/domain.md`, which is exactly the amount of friction the decision
deserves.

Ids carry their entity type as a prefix, so a reference is a self-describing
string and a link needs two columns rather than four.

Links are a set, not a bag. Deleting an entity deletes its links.

Reading a relation is a join, so the store exposes named domain operations —
`getTasksForPerson`, `getTasksForGoal`, `getMemoryOrigin` — and no component
ever writes the join itself.

## Consequences

- Any two entities can be related without a schema change.
- The CRM's by-person view costs a lookup instead of a field read. In a JSON
  document that is a map; in Postgres it is an indexed join. Neither matters
  at one person's volume.
- `links` is one of the two collections that grow fastest (the other is
  `events`). It is the first place to look the day something feels slow.
- Do not reintroduce a convenience foreign key "just for this one hot path".
  Two answers to "where is a relation stored" is the failure this decision
  exists to prevent; add a named store operation instead.
