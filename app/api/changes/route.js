import { refuseUnlessAllowed } from '@/lib/phone-gate.js';
import { onStoreChange } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** How long a browser waits before it reconnects, in ms. */
const RETRY_MS = 3000;
/** A comment line now and then keeps a proxy from closing an idle stream. */
const HEARTBEAT_MS = 25000;

/**
 * Live updates (#293, ADR 0065): an event stream with one `change` message,
 * carrying nothing, each time the store writes. The page answers by
 * refreshing its server data; this route reads no record and calls neither a
 * model nor an integration. Behind the phone gate like every route a proxy
 * may reach.
 *
 * @param {Request} request
 */
export async function GET(request) {
  const refused = refuseUnlessAllowed(request);
  if (refused) return refused;

  const encoder = new TextEncoder();
  /** @type {() => void} */
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (/** @type {string} */ text) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // The client is gone; the abort handler below does the cleanup.
          cleanup();
        }
      };
      const stopListening = onStoreChange(() => send('event: change\ndata: {}\n\n'));
      const heartbeat = setInterval(() => send(': keep-alive\n\n'), HEARTBEAT_MS);
      let closed = false;
      cleanup = () => {
        if (closed) return;
        closed = true;
        stopListening();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed by the client going away.
        }
      };
      request.signal.addEventListener('abort', cleanup);
      send('retry: ' + String(RETRY_MS) + '\n\n');
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
