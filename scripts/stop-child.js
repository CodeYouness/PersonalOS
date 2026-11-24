/**
 * Stops a child process for good (ADR 0067): asks it with a signal, and
 * kills it when it is still there once the grace is over.
 *
 * `next start` takes SIGTERM, closes its port and then waits for its open
 * connections -- and a page left open holds a live-updates stream
 * (ADR 0065) that never ends. A stop that only asks therefore never
 * finishes, and the writer lock is never released.
 */

/**
 * @typedef {object} ChildEnd
 * @property {number | null} code its exit code, null when a signal ended it
 * @property {NodeJS.Signals | null} signal the signal that ended it, if one did
 * @property {boolean} killed whether the grace ran out and it was killed
 */

/**
 * @param {import('node:child_process').ChildProcess} child
 * @param {NodeJS.Signals} signal what to ask with
 * @param {number} graceMs how long it has to go by itself
 * @returns {Promise<ChildEnd>} resolves once the child has ended
 */
export function stopChild(child, signal, graceMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode, killed: false });
      return;
    }
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, graceMs);
    child.once('exit', (code, endedBy) => {
      clearTimeout(timer);
      resolve({ code, signal: endedBy, killed });
    });
    child.kill(signal);
  });
}
