/**
 * What a schedule may need of the machine before it runs (ADR 0066), and how
 * that is read. One need so far: `unlocked` -- the broker's signing key
 * lives in the Secure Enclave and cannot be used while the Mac is locked.
 *
 * The answer only ever delays a run. Anything that cannot be read -- no
 * `ioreg`, a root entry that does not say, a machine that is not a Mac --
 * counts as ready, so the job runs and says for itself what is wrong.
 */

import { execFile } from 'node:child_process';

/** Absolute, so a launchd agent's short PATH does not matter. */
const IOREG = '/usr/sbin/ioreg';
const IOREG_TIMEOUT_MS = 5000;

/**
 * Whether `ioreg -n Root -d1 -a` describes an unlocked console.
 *
 * @param {string} rootPlist
 * @returns {boolean}
 */
export function readsUnlocked(rootPlist) {
  return !/<key>IOConsoleLocked<\/key>\s*<true\/>/.test(rootPlist);
}

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<string>}
 */
function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: IOREG_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

/**
 * Whether the machine has what a schedule needs right now.
 *
 * @param {string} need one of SCHEDULE_NEEDS
 * @param {{ platform?: string, read?: (command: string, args: string[]) => Promise<string> }} [options]
 * @returns {Promise<boolean>}
 */
export async function isMachineReady(need, { platform = process.platform, read = run } = {}) {
  if (need !== 'unlocked') throw new Error('unknown schedule need ' + JSON.stringify(need));
  if (platform !== 'darwin') return true;
  try {
    return readsUnlocked(await read(IOREG, ['-n', 'Root', '-d1', '-a']));
  } catch {
    return true;
  }
}
