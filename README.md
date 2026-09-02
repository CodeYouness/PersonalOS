# PersonalOS

A personal dashboard for one person: tasks, calendar, finances, habits, and a
memory that learns who you are. You say a thing once -- typed or spoken -- and
the system decides where it belongs and files it. When you ask it a question,
it answers from your own data and cites where each claim came from.

This is both a working personal system and a template. Clone it, change the
configuration, and it is yours.

> **Status: foundations.** The data layer, configuration and verification
> pipeline are in place. The capture pipeline and the dashboard cards are next
> -- see [docs/roadmap.md](docs/roadmap.md).

## Getting started

```bash
nvm use                # Node 22
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. It runs on demo seed data with no API key set.

Nothing is required in `.env.local` to start. Each variable switches on the
feature described next to it; `ANTHROPIC_API_KEY` is what turns the classifier
from keyword rules into a model.

## Your data

Two files, and the difference matters:

| File | What it is |
| --- | --- |
| `data/seed.json` | The starting state. Versioned, demo content, never written to. |
| `data/personalos.json` | Your life. Git-ignored, regenerated from the seed when missing. |

Deleting the second one restores the first. That is the undo button, and
`npm run data:reset` is the same thing as a command. Set `DATA_DIR` if you
would rather keep your data outside the repository entirely.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run verify` | lint + typecheck + test + build -- the gate for any change |
| `npm test` | Tests only |
| `npm run check:secrets` | Fails if personal data or a credential is tracked |
| `npm run data:reset` | Restore the working data from the seed |

## Architecture in one paragraph

Every read and write goes through `lib/store.js`, which delegates to a storage
adapter. Today that adapter is a JSON file; the contract in
`lib/adapters/contract.js` is written in domain terms so a database adapter can
take its place without anything above it changing, and it inherits the existing
test suite as proof of equivalence. Product configuration lives in
`personalos.config.js`, secrets only in the environment, and exactly one module
reads `process.env`.

See [docs/architecture.md](docs/architecture.md) for the long version and
[docs/domain.md](docs/domain.md) for what the words mean.

## Working with an AI agent

The repository is written to be picked up by a coding agent that has never seen
it. [CLAUDE.md](CLAUDE.md) is the operating brief, [docs/](docs) holds the
detail, and [docs/decisions/](docs/decisions) records the choices that would
otherwise look arbitrary and get "fixed" by mistake.

## Credits

Built following the guide *PersonalOS* by Giuseppe Castagna -- see
[docs/spec-source.md](docs/spec-source.md).

## License

MIT. See [LICENSE](LICENSE).
