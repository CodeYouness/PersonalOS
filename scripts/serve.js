#!/usr/bin/env node
/**
 * `npm run serve`: the one writer of the real data (ADR 0032). A production
 * build, then `next start` on 127.0.0.1 -- only this Mac reaches it. Code
 * changes reach it only when it is rebuilt: stop it and run this again.
 *
 * It takes the lock on the data directory first (lib/writer-lock.js), so a
 * second `serve` refuses, and so does `npm run dev`. A lock whose process is
 * gone is taken over.
 *
 * Arguments pass through to `next start`: `npm run serve -- -p 3100`.
 */

import { spawn, spawnSync } from 'node:child_process';

import { env } from '../lib/config/env.js';
import { acquireLock, lockPathFor } from '../lib/writer-lock.js';

const lock = await acquireLock(lockPathFor(env.dataDir));
if (!lock.acquired) {
  console.error(
    'npm run serve is already running (process ' + lock.holder.pid + ', since ' + lock.holder.startedAt + ').\n' +
      'There is one writer. Stop that process (kill ' + lock.holder.pid + ') to start another.'
  );
  process.exit(1);
}

const release = lock.release;
let stopping = false;
/** @param {number} code */
async function stop(code) {
  if (stopping) return;
  stopping = true;
  await release();
  process.exit(code);
}

const build = spawnSync('npx', ['next', 'build'], { stdio: 'inherit' });
if (build.status !== 0) await stop(build.status ?? 1);

const server = spawn('npx', ['next', 'start', '-H', '127.0.0.1', ...process.argv.slice(2)], { stdio: 'inherit' });
server.on('exit', (code) => stop(code ?? 0));
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
  process.on(signal, () => server.kill(signal));
}
