# 0003. Keeping code, configuration, seed and personal data apart

- **Status** accepted
- **Date** 2026-09-01

## Context

**The GitHub repository is public**, and the application it builds is designed
to hold net worth, contacts, health measurements and dictated reflections. A
leak here is not fixed by deleting a file: git history keeps it.

At the same time the project is meant to be a template, so a fresh clone has to
show something working -- an empty skeleton teaches nobody anything.

Four kinds of thing were getting confused: application code, product
configuration, demo data, and one person's life.

## Decision

Four homes, and nothing sits in two of them.

| Kind | Home | Versioned |
| --- | --- | --- |
| Product configuration | `personalos.config.js` | yes |
| Secrets and environment | `.env.local`, read only by `lib/config/env.js` | no (`.env.example` is) |
| Demo starting state | `data/seed.json` | yes |
| Your life | `data/personalos.json` | no |

- `data/seed.json` carries a **fictional** profile. The real profile only ever
  exists in the working file.
- `DATA_DIR` moves the data directory out of the repository entirely for anyone
  who wants that.
- `scripts/check-secrets.js` fails if a `.env` file, the working data, a `.pem`
  or a credential-shaped string is tracked. It runs in CI and before pushing.
- The guide this project follows is a third party's work and is **not**
  redistributed: it stays on disk, git-ignored. Attribution is not a licence.
  See `docs/spec-source.md`.

## Consequences

- A fresh clone runs immediately, on demo data, with no key configured.
- No key ever gets a `NEXT_PUBLIC_` prefix. That prefix is not a naming
  convention, it is an instruction to ship the value to the browser.
- `check:secrets` is a heuristic, not a guarantee. It is a floor under
  attention, not a replacement for it.
- If a secret is ever committed, treat it as compromised and rotate it. Do not
  merely delete the file.
