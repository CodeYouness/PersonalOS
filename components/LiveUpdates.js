'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useEffect } from 'react';

import { createLiveRefresh } from './liveRefresh.js';

/** How long to wait before opening a connection the browser gave up on. */
const RECONNECT_MS = 3000;

/**
 * Keeps an open page current (#293, ADR 0065): listens to the change stream
 * and, on a signal, asks Next to re-render the page's server components from
 * the saved values. `router.refresh()` merges the new payload and keeps
 * client state, so what is half-typed in a field stays. A connection that
 * dropped reconnects, and the first open after it refreshes once.
 *
 * The browser retries a dropped stream by itself, but gives up for good when
 * a retry meets a refused connection (the server restarting), so a closed
 * source is opened again here. Renders nothing.
 */
export default function LiveUpdates() {
  const router = useRouter();

  useEffect(() => {
    const live = createLiveRefresh({ refresh: () => startTransition(() => router.refresh()) });
    let stopped = false;
    /** @type {EventSource | null} */
    let source = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let retry = null;

    function connect() {
      retry = null;
      const next = new EventSource('/api/changes');
      source = next;
      next.addEventListener('open', live.onOpen);
      next.addEventListener('change', live.onChange);
      next.addEventListener('error', () => {
        live.onError();
        if (!stopped && next.readyState === EventSource.CLOSED) retry = setTimeout(connect, RECONNECT_MS);
      });
    }

    connect();
    return () => {
      stopped = true;
      if (retry !== null) clearTimeout(retry);
      source?.close();
      live.stop();
    };
  }, [router]);

  return null;
}
