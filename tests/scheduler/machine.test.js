/**
 * Whether the Mac is unlocked, read from `ioreg`'s root entry. The answer
 * only ever delays a run, so anything unreadable counts as unlocked.
 */

import { describe, expect, it } from 'vitest';

import { isMachineReady, readsUnlocked } from '@/lib/scheduler/machine.js';

/** @param {string} value */
const root = (value) => '<dict>\n\t<key>IOConsoleLocked</key>\n\t' + value + '\n\t<key>IOConsoleUsers</key>\n\t<array/>\n</dict>';

describe('readsUnlocked', () => {
  it('reads a locked and an unlocked console', () => {
    expect(readsUnlocked(root('<true/>'))).toBe(false);
    expect(readsUnlocked(root('<false/>'))).toBe(true);
  });

  it('counts a root entry that does not say as unlocked', () => {
    expect(readsUnlocked('<dict></dict>')).toBe(true);
    expect(readsUnlocked('')).toBe(true);
  });
});

describe('isMachineReady', () => {
  it('asks ioreg on a Mac and answers what it reads', async () => {
    /** @type {string[][]} */
    const calls = [];
    const read = async (/** @type {string} */ command, /** @type {string[]} */ args) => { calls.push([command, ...args]); return root('<true/>'); };
    expect(await isMachineReady('unlocked', { platform: 'darwin', read })).toBe(false);
    expect(calls).toEqual([['/usr/sbin/ioreg', '-n', 'Root', '-d1', '-a']]);
  });

  it('is ready when ioreg cannot be run, and on a machine that is not a Mac without asking', async () => {
    expect(await isMachineReady('unlocked', { platform: 'darwin', read: async () => { throw new Error('ENOENT'); } })).toBe(true);
    let asked = false;
    expect(await isMachineReady('unlocked', { platform: 'linux', read: async () => { asked = true; return root('<true/>'); } })).toBe(true);
    expect(asked).toBe(false);
  });

  it('refuses a need it does not know', async () => {
    await expect(isMachineReady('charged', { platform: 'darwin', read: async () => '' })).rejects.toThrow(/charged/);
  });
});
