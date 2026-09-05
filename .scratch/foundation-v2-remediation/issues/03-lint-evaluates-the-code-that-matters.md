# 03 — Lint evaluates the layers where the logic lives

**Status:** resolved 2026-09-05.

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

## Outcome

`eslint.config.mjs` now applies `no-unused-vars` (with `ignoreRestSiblings`,
for the migration code's deliberate `const { x, ...rest } = y` idiom),
`eqeqeq` and `no-undef` to `lib/`, `scripts/` and `tests/` — the layers
`eslint-config-next`'s JSX-only rules never touched. Demonstrated before and
after: a loose equality and a genuinely unused binding, piped through
`eslint --stdin`, produced zero output on the old config and two errors on
the new one.

The four invariants are `no-restricted-imports`/`no-restricted-syntax` rules,
each demonstrated the same way:

- No `@/` alias inside `lib/`.
- No `process.env` outside `lib/config/env.js` (tests are exempt — they set
  `process.env` directly to drive `env.js` through its own fallbacks, which
  is a different concern from reading configuration in application code).
- No computing a day key by slicing an ISO string outside
  `lib/domain/dates.js` (ADR-0005). This one **does** cover tests.
- No importing a storage adapter from outside `lib/store.js` (the adapter
  contract suite and the migration tests are exempt — they exist to test the
  adapters directly, which is testing the data layer, not bypassing it).

One real violation surfaced and was fixed in this ticket: `no-unused-vars`
flagged three unused bindings, all the same intentional-omission idiom,
handled by the `ignoreRestSiblings` option rather than a rename.

One real violation surfaced and was **not** fixed here, on purpose:
`scripts/reset-data.js` imports the JSON adapter directly. It is carved out
of the adapter-import rule with a comment pointing at ticket 07, which owns
fixing it — ticket 07's own "what done looks like" already assumes this
lint rule exists ("Lint enforces it (ticket 03)"). Removing the carve-out is
part of closing ticket 07.

Learned while wiring this up: ESLint's flat config replaces a rule's whole
options when the same rule name appears in a later matching config block —
it does not merge multiple blocks' restrictions together. Every restriction
that can apply to the same file has to live in one block per rule; blocks are
kept file-disjoint only where the restrictions genuinely differ (`tests/`
needs the ADR-0005 rule but not the `process.env` one).

`docs/decisions/0001-stack-and-typing.md` was re-read and makes no claim that
ESLint already enforced any of this, so it needed no correction.

`npm run verify` green on all four stages, 137 tests, `globals` added as an
explicit dev dependency (already a transitive one, via `eslint-config-next`)
for the Node globals the base rules need in `lib/`/`scripts/`/`tests/`.
