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
 *
 * The sandbox follows data/seed.json. When it changes -- a branch switch to
 * another schema version, an edit to the demo data -- the new seed is copied
 * in and the working copy dropped, so the next request rebuilds from it.
 * Without this the server keeps the seed it started with, and a branch at a
 * lower schema version refuses data "newer than this code".
 */

import { spawn } from 'node:child_process';
import { unwatchFile, watchFile } from 'node:fs';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-sandbox-'));
await copyFile('data/seed.json', path.join(sandbox, 'seed.json'));
console.log('sandboxed data in ' + sandbox);

// Polled rather than fs.watch: a checkout replaces the file, and a watch on
// the old one would go quiet.
watchFile('data/seed.json', { interval: 1000 }, async (current, previous) => {
  if (current.mtimeMs === previous.mtimeMs || current.size === 0) return;
  try {
    await copyFile('data/seed.json', path.join(sandbox, 'seed.json'));
    for (const file of await readdir(sandbox)) {
      if (file.startsWith('personalos.json')) await rm(path.join(sandbox, file), { force: true });
    }
    console.log('seed.json changed: the sandbox starts again from it');
  } catch (error) {
    // The server keeps running on the old seed; restarting it starts clean.
    console.error('seed.json changed but the sandbox could not follow:', error);
  }
});

const server = spawn('npx', ['next', 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  // Hands the whole environment on to the server, reading nothing from it:
  // lib/config/env.js still validates every value inside `next dev`.
  // eslint-disable-next-line no-restricted-syntax
  env: { ...process.env, DATA_DIR: sandbox },
});

/** @param {number} code */
async function cleanUp(code) {
  unwatchFile('data/seed.json');
  await rm(sandbox, { recursive: true, force: true });
  process.exit(code);
}

server.on('exit', (code) => cleanUp(code ?? 0));
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
  process.on(signal, () => server.kill(signal));
}
