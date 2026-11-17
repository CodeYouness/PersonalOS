/**
 * Reads the .env files the way `next dev` does -- `.env.local` and the rest,
 * a variable exported in the shell winning over them -- before
 * lib/config/env.js reads the environment, which it does once, at import.
 * scripts/categorise.js imports this first, so `--model` finds the key in
 * `.env.local` as `npm run eval:classify` does; the importers that never call
 * the model do not need it. Under vitest (NODE_ENV test) `.env.local` is not
 * read: a test sets its own variables.
 */

import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });
