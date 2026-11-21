/**
 * "Something changed" (ticket #293): the one signal a successful write sends
 * so an open page can re-read. It carries no data -- the page reads the saved
 * values itself, which is what keeps rule 3 true (no model, no integration).
 *
 * The listeners live on globalThis under a well-known symbol, like the write
 * queue: Next bundles server code more than once, and the route that listens
 * and the adapter that announces may be different instances of this module.
 */

const LISTENERS = Symbol.for('personalos.changes.listeners');

/** @type {{ [LISTENERS]?: Set<() => void> }} */
const shared = /** @type {any} */ (globalThis);

/** @returns {Set<() => void>} */
function listeners() {
  shared[LISTENERS] ??= new Set();
  return shared[LISTENERS];
}

/**
 * @param {() => void} listener
 * @returns {() => void} stops listening
 */
export function onStoreChange(listener) {
  const set = listeners();
  const own = () => listener();
  set.add(own);
  return () => {
    set.delete(own);
  };
}

/** Called by the adapter after a write reached the disk. Never throws. */
export function announceChange() {
  for (const listener of [...listeners()]) {
    try {
      listener();
    } catch (error) {
      console.error('[changes] a listener failed: ' + (error instanceof Error ? error.message : String(error)));
    }
  }
}

/** How many listeners are attached. For tests and diagnostics. */
export function listenerCount() {
  return listeners().size;
}
