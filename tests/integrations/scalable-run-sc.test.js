/**
 * Smoke test of the thin child-process wrapper, against a stub script that
 * stands in for `sc`. The sync's behaviour is tested through the fake runner.
 */

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ScCommandError } from '@/lib/integrations/scalable/client.js';
import { makeScRunner } from '@/lib/integrations/scalable/run-sc.js';

const stub = path.join(process.cwd(), 'tests/integrations/fake-sc-stub.js');
const runner = (/** @type {string} */ mode) => makeScRunner({ command: process.execPath, prefixArgs: [stub, mode] });

describe('the sc child-process wrapper', () => {
  it('adds --json and returns the parsed stdout', async () => {
    expect(await runner('ok')(['broker', 'holdings'])).toEqual({ ok: true, command: 'stub', data: { echoed: ['broker', 'holdings', '--json'] } });
  });

  it('turns a non-zero exit into an error carrying the exit code and the message', async () => {
    await expect(runner('fail')(['broker', 'holdings'])).rejects.toMatchObject({ exitCode: 20, message: 'session expired' });
    await expect(runner('fail')(['x'])).rejects.toBeInstanceOf(ScCommandError);
  });

  it('rejects output that is not JSON', async () => {
    await expect(runner('garbage')(['x'])).rejects.toThrow(/did not print JSON/);
  });

  it('rejects when the binary is missing', async () => {
    await expect(makeScRunner({ command: 'definitely-not-sc-binary' })(['x'])).rejects.toThrow(/could not run/);
  });
});
