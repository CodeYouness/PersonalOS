# 0002. One data layer, behind an adapter contract

- **Status** accepted
- **Date** 2026-09-01

## Context

The spec offers exactly one architectural rule: every read and write goes
through a single module, so that replacing a JSON file with Postgres later is a
rewrite of that module rather than of the application. It suggests a single
`lib/store.js`.

Taken literally, "same signatures" is a hope. Nothing checks it, and the day
the second implementation appears there is no way to answer whether it behaves
the same beyond reading both files carefully.

Storing whole-state primitives (`readState`, `writeState`) in the shared
interface would not survive the move either: a database adapter cannot read the
entire dataset on every call.

## Decision

`lib/store.js` stays, with exactly the name and the domain-level signatures the
spec describes. It is a thin facade that selects one adapter and re-exports its
operations.

Behind it, `lib/adapters/contract.js` lists the operations an adapter must
implement -- **in domain terms** (`getTasks`, `createTask`, `getDailyLog`),
never storage terms -- and `assertImplementsContract` fails at load time if one
is missing.

`tests/store/adapter-contract.js` is a suite parameterised by adapter. Any
adapter runs it.

## Consequences

- Roughly sixty extra lines and one indirection, versus a single file.
- In exchange, the second adapter arrives with a test suite already written,
  and "is it equivalent?" becomes a command instead of a judgement call.
- The temptation to export the raw document from `lib/store.js` must be
  resisted: that is the signal a domain operation is missing.
- Do not "simplify" this by collapsing the adapter into the facade. The
  indirection is the point, and the second implementation is expected, not
  hypothetical.
