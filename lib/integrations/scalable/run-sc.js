/**
 * The thin child-process wrapper around `sc` (ADR 0010, ADR 0031): the only
 * place a process is spawned. It adds `--json`, waits, parses stdout, and
 * turns a non-zero exit into a ScCommandError. The session lives in the macOS
 * Keychain, so no credential passes through here.
 */

import { execFile } from 'node:child_process';

import { ScCommandError } from './client.js';

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const TIMEOUT_MS = 120_000;

/**
 * @param {{ command?: string, prefixArgs?: string[] }} [options] `command`
 *   and `prefixArgs` exist so a smoke test can point at a stub script
 * @returns {import('./client.js').ScRunner}
 */
export function makeScRunner({ command = 'sc', prefixArgs = [] } = {}) {
  return (args) =>
    new Promise((resolve, reject) => {
      execFile(
        command,
        [...prefixArgs, ...args, '--json'],
        { maxBuffer: MAX_OUTPUT_BYTES, timeout: TIMEOUT_MS },
        (error, stdout) => {
          /** @type {any} */
          const failure = error;
          if (failure !== null && typeof failure.code !== 'number') {
            reject(new ScCommandError(1, 'could not run `' + command + '`: ' + failure.message));
            return;
          }
          /** @type {unknown} */
          let parsed;
          try {
            parsed = JSON.parse(stdout);
          } catch {
            reject(new ScCommandError(failure?.code ?? 0, '`' + command + ' ' + args.join(' ') + '` did not print JSON'));
            return;
          }
          if (failure !== null) {
            const message = /** @type {any} */ (parsed)?.error?.message;
            reject(new ScCommandError(failure.code, typeof message === 'string' ? message : 'sc exited with code ' + failure.code));
            return;
          }
          resolve(parsed);
        }
      );
    });
}
