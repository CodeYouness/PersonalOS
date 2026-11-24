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
 *
 * Told to stop (SIGTERM from launchd, Ctrl-C), it always does (ADR 0067):
 * the server is asked first and killed when it has not gone within
 * `limits.serveStopGraceMs`, then the lock is released. The server is
 * started as `node next`, with no `npx` in between, so the signal and the
 * kill reach the server itself and not a wrapper that would leave it behind.
 */

import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { env } from '../lib/config/env.js';
import { acquireLock, lockPathFor } from '../lib/writer-lock.js';
import { limits } from '../personalos.config.js';
import { stopChild } from './stop-child.js';

const NEXT_BIN = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));

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

// PERSONALOS_SCHEDULER=1 is what makes instrumentation.js start the scheduler
// (ADR 0062): set here, on the server only -- not for the build, not for dev.
// eslint-disable-next-line no-restricted-syntax
const serverEnv = { ...process.env, PERSONALOS_SCHEDULER: '1' };
const server = spawn(process.execPath, [NEXT_BIN, 'start', '-H', '127.0.0.1', ...process.argv.slice(2)], { stdio: 'inherit', env: serverEnv });
server.on('exit', (code) => stop(code ?? 0));
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
  process.on(signal, async () => {
    const ended = await stopChild(server, signal, limits.serveStopGraceMs);
    if (ended.killed) console.error('The server had not stopped after ' + limits.serveStopGraceMs + ' ms and was killed.');
    await stop(ended.code ?? 0);
  });
}
