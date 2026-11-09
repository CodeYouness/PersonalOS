#!/usr/bin/env node
/**
 * `npm run dev`: the development server on the real data, on 127.0.0.1 only
 * (ADR 0032). It refuses to start while `npm run serve` holds the data
 * directory: two processes writing one file is the lost-write bug ADR 0011
 * closed. `npm run dev:sandbox` works on its own copy and does not check.
 *
 * Arguments pass through to `next dev`: `npm run dev -- -p 3100`.
 */

import { spawn } from 'node:child_process';

import { env } from '../lib/config/env.js';
import { checkLock, lockPathFor } from '../lib/writer-lock.js';

const holder = await checkLock(lockPathFor(env.dataDir));
if (holder !== null) {
  console.error(
    'npm run dev will not start: npm run serve holds the data (process ' + holder.pid + ', since ' + holder.startedAt + ').\n' +
      'Two servers writing one file lose writes. Stop it first (kill ' + holder.pid + '), or check a change on\n' +
      'a throwaway copy of the data with npm run dev:sandbox.'
  );
  process.exit(1);
}

const server = spawn('npx', ['next', 'dev', '-H', '127.0.0.1', ...process.argv.slice(2)], { stdio: 'inherit' });
server.on('exit', (code) => process.exit(code ?? 0));
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
  process.on(signal, () => server.kill(signal));
}
