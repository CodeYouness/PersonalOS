/**
 * Where the channel starts (ADR 0064): only in the process `npm run serve`
 * started, only with both values set, and with nothing asked of Telegram
 * otherwise. Being off is recorded once as a skipped run.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { RUN_REASONS } from '@/personalos.config.js';
import { startChannel } from '@/lib/telegram/start.js';

function fakeStore() {
  /** @type {any[]} */
  const runs = [];
  return {
    runs,
    getRuns: async (/** @type {{ schedule?: string }} */ { schedule } = {}) => [...runs].reverse().filter((run) => schedule === undefined || run.schedule === schedule),
    recordRun: async (/** @type {any} */ run) => { runs.push(run); return run; },
  };
}

const NOW = () => new Date('2026-06-15T08:00:00Z');

/** @param {Record<string, unknown>} over */
function start(over) {
  let made = 0;
  const store = fakeStore();
  const options = {
    enabled: true, token: 'not-a-real-token', chatId: 1001, store, now: NOW, run: false,
    makeTransport: () => { made += 1; return { getUpdates: async () => [], sendMessage: async () => {} }; },
    ...over,
  };
  return { store: /** @type {ReturnType<typeof fakeStore>} */ (options.store), made: () => made, go: () => startChannel(/** @type {any} */ (options)) };
}

describe('startChannel', () => {
  it('starts nothing, asks nothing and records nothing in a process serve did not start', async () => {
    const attempt = start({ enabled: false });
    expect(await attempt.go()).toBeNull();
    expect(attempt.made()).toBe(0);
    expect(attempt.store.runs).toEqual([]);
  });

  it.each([
    ['the token', { token: null }],
    ['the chat id', { chatId: null }],
    ['both', { token: null, chatId: null }],
  ])('makes no request at all when %s is missing, and records the channel as off', async (_what, missing) => {
    const attempt = start(missing);

    expect(await attempt.go()).toBeNull();

    expect(attempt.made()).toBe(0);
    expect(attempt.store.runs).toEqual([{
      schedule: 'telegram', startedBy: 'schedule', engine: 'script', startedAt: '2026-06-15T08:00:00.000Z',
      durationMs: 0, outcome: 'skipped', reason: RUN_REASONS.notConfigured,
    }]);
  });

  it('records being off once, not at every start', async () => {
    const attempt = start({ token: null });
    await attempt.go();
    await attempt.go();
    expect(attempt.store.runs).toHaveLength(1);
  });

  it('records being off again when the channel has run since', async () => {
    const attempt = start({ token: null });
    await attempt.go();
    attempt.store.runs.push({ schedule: 'telegram', outcome: 'ok', reason: '' });
    await attempt.go();
    expect(attempt.store.runs.filter((run) => run.outcome === 'skipped')).toHaveLength(2);
  });

  it('with both values, makes the transport with the token and listens to that chat only', async () => {
    /** @type {any[]} */
    const madeWith = [];
    const attempt = start({ makeTransport: (/** @type {any} */ options) => { madeWith.push(options); return { getUpdates: async () => [], sendMessage: async () => {} }; } });

    const channel = await attempt.go();

    expect(madeWith).toEqual([{ token: 'not-a-real-token' }]);
    expect(channel).not.toBeNull();
    expect(attempt.store.runs).toEqual([]);
  });
});

describe('startTelegramChannel', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    /** @type {any} */ (globalThis)[Symbol.for('personalos.telegram.started')] = undefined;
  });

  it.each([
    ['dev and the sandbox, which never set the variable', { PERSONALOS_SCHEDULER: '' }],
    ['Vitest, even with a stale variable', { PERSONALOS_SCHEDULER: '1', VITEST: 'true' }],
  ])('does not start under %s, and calls nothing', async (_where, variables) => {
    for (const [name, value] of Object.entries(variables)) vi.stubEnv(name, value);
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'not-a-real-token');
    vi.stubEnv('TELEGRAM_CHAT_ID', '1001');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const { startTelegramChannel } = await import('@/lib/telegram/start.js');

    expect(await startTelegramChannel()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
