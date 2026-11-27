/**
 * Starts the real Telegram channel (ADR 0064): the token and the chat from
 * the environment, the real transport, the store. Called from
 * `instrumentation.js` beside the scheduler, not awaited.
 *
 * It starts only in the process `npm run serve` started -- the same test as
 * the scheduler (`env.schedulerEnabled`, ADR 0062) -- so development, the
 * sandbox, scripts and tests never listen. And only with both values set:
 * with either missing no transport is made and no request leaves, and being
 * off is recorded once as a skipped run.
 */

import { CHANNEL_IDS, limits, RUN_REASONS } from '../../personalos.config.js';
import { env } from '../config/env.js';
import * as realStore from '../store.js';
import { createTelegramChannel } from './channel.js';
import { handleTelegramText } from './handle.js';
import { makeTelegramTransport } from './transport.js';

const CHANNEL = CHANNEL_IDS[0];
const STARTED = Symbol.for('personalos.telegram.started');

/** @type {{ [STARTED]?: ReturnType<typeof createTelegramChannel> }} */
const shared = /** @type {any} */ (globalThis);

/**
 * Records that the channel is off, unless that is already the last thing
 * its log says: a restart does not add a row.
 *
 * @param {{ getRuns: (options?: object) => Promise<any[]>, recordRun: (run: object) => Promise<any> }} store
 * @param {Date} at
 */
async function recordOff(store, at) {
  const [last] = await store.getRuns({ schedule: CHANNEL, limit: 1 });
  if (last?.outcome === 'skipped' && last.reason === RUN_REASONS.notConfigured) return;
  await store.recordRun({
    schedule: CHANNEL,
    startedBy: 'schedule',
    engine: 'script',
    startedAt: at.toISOString(),
    durationMs: 0,
    outcome: 'skipped',
    reason: RUN_REASONS.notConfigured,
  });
}

/**
 * The decision, with everything it depends on as an argument.
 *
 * @param {object} options
 * @param {boolean} options.enabled whether this is the process `serve` started
 * @param {string | null} options.token
 * @param {number | null} options.chatId
 * @param {{ getRuns: (options?: object) => Promise<any[]>, recordRun: (run: object) => Promise<any> }} options.store
 * @param {(options: { token: string }) => import('./transport.js').TelegramTransport} [options.makeTransport]
 * @param {(message: import('./channel.js').TelegramMessage) => Promise<string>} [options.handle]
 * @param {() => Date} [options.now]
 * @param {boolean} [options.run] `false` builds the channel without starting its loop (tests)
 * @returns {Promise<ReturnType<typeof createTelegramChannel> | null>} the
 *   channel, or null when nothing was started
 */
export async function startChannel({ enabled, token, chatId, store, makeTransport = makeTelegramTransport, handle = handleTelegramText, now = () => new Date(), run = true }) {
  if (!enabled) return null;
  if (token === null || chatId === null) {
    await recordOff(store, now());
    return null;
  }
  const channel = createTelegramChannel({
    transport: makeTransport({ token }),
    chatId,
    handle,
    pollSeconds: limits.telegramPollSeconds,
    backoff: { minMs: limits.telegramBackoffMinMs, maxMs: limits.telegramBackoffMaxMs },
  });
  if (run) void channel.run();
  return channel;
}

/**
 * @returns {Promise<boolean>} whether a channel was started by this call
 */
export async function startTelegramChannel() {
  if (shared[STARTED] !== undefined) return false;
  const channel = await startChannel({
    enabled: env.schedulerEnabled,
    token: env.telegramBotToken,
    chatId: env.telegramChatId,
    store: realStore,
  });
  if (channel === null) return false;
  shared[STARTED] = channel;
  return true;
}

/** Stops the channel this process started; for tests. */
export function stopTelegramChannel() {
  shared[STARTED]?.stop();
  shared[STARTED] = undefined;
}
