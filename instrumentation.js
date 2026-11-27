/**
 * Next calls `register()` once when the server instance starts (see
 * node_modules/next/dist/docs, "Instrumentation"). It starts the scheduler
 * (ADR 0062) in the Node runtime only, and does not await it: the server
 * must not wait for a schedule. The scheduler itself decides whether this
 * process was started by `npm run serve`; under `dev`, the sandbox and tests
 * it starts nothing. The Telegram channel (ADR 0064) starts beside it, by
 * the same test, and is not awaited either.
 */
import { errorMessage } from './lib/domain/error-message.js';

export async function register() {
  // NEXT_RUNTIME is Next's own marker, not configuration.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startScheduler } = await import('./lib/scheduler/start.js');
  startScheduler();
  const { startTelegramChannel } = await import('./lib/telegram/start.js');
  void startTelegramChannel().catch((error) => {
    console.error('[telegram] could not start: ' + errorMessage(error));
  });
}
