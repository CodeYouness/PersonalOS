# 0001. Next.js 16, JavaScript with JSDoc types

- **Status** accepted
- **Date** 2026-09-01

## Context

The spec settles the stack: Next.js with the App Router, JavaScript rather than
TypeScript, no Tailwind, no `src/`. Its argument against TypeScript is specific
and good -- when an agent writes most of the code, the compiler-complains,
agent-fixes, compiler-complains loop costs more time than the errors it catches
on a few thousand lines.

But the same spec adds: take TypeScript if the project is meant to grow, or if
other people will work on it. This project is meant to be four things at once
-- a personal system, an open source project, a template others clone, and a
codebase that AI agents modify without losing the thread. That is precisely the
condition it names.

There is also a practical requirement pulling the same way: every change is
supposed to be finished by running a verification command. Without any static
checking, that command can only run tests and a build.

## Decision

JavaScript, with JSDoc type annotations checked by `tsc` in strict mode through
`jsconfig.json` (`allowJs`, `checkJs`, `strict`), exposed as `npm run
typecheck` and included in `npm run verify`.

No `.ts` files. Annotations at module boundaries; inference inside functions.

Contrary to the spec, ESLint is kept -- one dev dependency, and without it a
lint check simply would not exist.

Next.js version follows whatever `create-next-app` installs; at bootstrap that
was 16.3.4.

## Consequences

- Real static verification, runnable by a person or an agent, without any
  compile step in the edit loop. Files stay `.js` and run as written.
- Some types are more awkward to express in JSDoc than in TypeScript. Where it
  gets ugly, prefer a simpler type over a clever one.
- `tsc` is a dev dependency even though there is no TypeScript in the project.
  That is expected, not an oversight.
- If the annotations ever become a burden rather than a help, the honest move
  is to reconsider this ADR -- not to quietly stop annotating.
