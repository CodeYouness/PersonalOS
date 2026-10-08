#!/usr/bin/env node
/**
 * The development server on a throwaway copy of the seed -- the way to check
 * a change in the browser without touching data/personalos.json.
 *
 * `npm run dev` reads and writes your real data, and the first page load
 * after a schema bump migrates it. Here DATA_DIR points at a fresh temporary
 * directory holding only seed.json, so every run starts from the demo data
 * and the directory is removed when the server stops.
 *
 * Arguments pass through to `next dev`: `npm run dev:sandbox -- -p 3100`.
 */

import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-sandbox-'));
await copyFile('data/seed.json', path.join(sandbox, 'seed.json'));
console.log('sandboxed data in ' + sandbox);

const server = spawn('npx', ['next', 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  // Hands the whole environment on to the server, reading nothing from it:
  // lib/config/env.js still validates every value inside `next dev`.
  // eslint-disable-next-line no-restricted-syntax
  env: { ...process.env, DATA_DIR: sandbox },
});

/** @param {number} code */
async function cleanUp(code) {
  await rm(sandbox, { recursive: true, force: true });
  process.exit(code);
}

server.on('exit', (code) => cleanUp(code ?? 0));
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
  process.on(signal, () => server.kill(signal));
}
