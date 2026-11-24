/**
 * `npm run serve` must end when it is told to (ADR 0067): the server it
 * started is asked first, and killed when it has not gone within the grace.
 * Real child processes, so the signals are the real ones.
 */

import { spawn } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import { stopChild } from '@/scripts/stop-child.js';

/** @type {import('node:child_process').ChildProcess[]} */
const started = [];

/**
 * A child that prints "ready" once its handlers are in place.
 *
 * @param {string} body
 */
async function child(body) {
  const process_ = spawn(process.execPath, ['-e', body + ';console.log("ready");setInterval(() => {}, 1000);'], { stdio: ['ignore', 'pipe', 'ignore'] });
  started.push(process_);
  await new Promise((resolve) => process_.stdout?.once('data', resolve));
  return process_;
}

afterEach(() => {
  for (const process_ of started.splice(0)) process_.kill('SIGKILL');
});

describe('stopChild', () => {
  it('asks with the signal it was given, and a child that goes is not killed', async () => {
    const polite = await child('process.on("SIGTERM", () => process.exit(7))');

    const ended = await stopChild(polite, 'SIGTERM', 2000);

    expect(ended).toEqual({ code: 7, signal: null, killed: false });
  });

  it('kills a child that is still there when the grace is over', async () => {
    // What `next start` does with a live-updates stream open: it takes the
    // signal, closes its port, and never exits.
    const stuck = await child('process.on("SIGTERM", () => {})');
    const before = Date.now();

    const ended = await stopChild(stuck, 'SIGTERM', 150);

    expect(ended).toEqual({ code: null, signal: 'SIGKILL', killed: true });
    expect(Date.now() - before).toBeGreaterThanOrEqual(150);
    expect(stuck.exitCode === null && stuck.signalCode === 'SIGKILL').toBe(true);
  });

  it('answers at once for a child that has already ended', async () => {
    const gone = await child('');
    gone.kill('SIGKILL');
    await new Promise((resolve) => gone.once('exit', resolve));

    expect(await stopChild(gone, 'SIGTERM', 2000)).toEqual({ code: null, signal: 'SIGKILL', killed: false });
  });
});
