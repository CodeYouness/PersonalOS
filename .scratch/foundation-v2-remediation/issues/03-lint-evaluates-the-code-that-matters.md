# 03 — Lint evaluates the layers where the logic lives

**Blocked by** 01.

## Why

The active configuration is React, Next, JSX and a11y rules only. There is no
`no-unused-vars`, no `eqeqeq`, no `no-undef`. The domain, the adapters, the
scripts and the tests contain no JSX at all, so in practice nothing about them
is linted. "No issues found" is currently a statement about code that was
never examined.

Worse, the seven rules in CLAUDE.md are defended by prose alone. A rule a
machine cannot check is a rule the next agent breaks by accident.

## What done looks like

- Running lint over deliberately sloppy JavaScript — a loose equality, an
  unused binding — reports errors. Demonstrate this before and after.
- Four project invariants fail lint rather than review:
  - no `@/` alias inside the parts that must run under plain Node
  - no reading of the environment outside the single module allowed to
  - no computing a day key by slicing an ISO string outside the one date module
  - no importing a storage adapter from outside the data layer
- Whatever the new rules surface is fixed in the same ticket, or listed
  explicitly if a fix belongs elsewhere.
- ADR-0001 is corrected: it justifies keeping ESLint with a claim that was not
  true in practice.

## Notes

The invariants are expressible with restricted-import and restricted-syntax
rules scoped per directory. Prefer four narrow rules with good messages over
one clever one — the message is what the next agent reads.
