/**
 * When an open page asks the framework to refresh (#293). A burst of changes
 * is one refresh; the first connection is not a change; a connection that
 * dropped and came back is one refresh, because anything may have happened in
 * between. Pure apart from the timer, so a test drives it without a browser.
 *
 * @param {{ refresh: () => void, delayMs?: number }} options
 */
export function createLiveRefresh({ refresh, delayMs = 250 }) {
  let dropped = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;

  function schedule() {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      refresh();
    }, delayMs);
  }

  return {
    onChange: schedule,
    onError() {
      dropped = true;
    },
    onOpen() {
      if (!dropped) return;
      dropped = false;
      schedule();
    },
    stop() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
