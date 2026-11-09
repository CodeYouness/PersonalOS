/**
 * The phone gate (ticket #228, ADR 0032): what `tailscale serve` forwards
 * needs the token; the Mac's own browser does not. Driven through the route
 * handlers with a real Request, each case importing them fresh because the
 * token is read once, when lib/config/env.js loads.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const TOKEN = 'a-made-up-token-for-tests';

/** What `tailscale serve` adds to every request it forwards. */
const PROXIED = { 'x-forwarded-for': '100.64.0.7', 'tailscale-user-login': 'someone@example.com' };

/** @type {string} */
let sandbox;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-gate-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('DATA_DIR', sandbox);
  vi.stubEnv('ANTHROPIC_API_KEY', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Fresh modules with the token set (or not), and the seed data restored.
 *
 * @param {string | undefined} token
 */
async function load(token) {
  vi.stubEnv('PERSONALOS_PHONE_TOKEN', token);
  const store = await import('@/lib/store.js');
  await store.resetToSeed();
  return {
    store,
    capture: await import('@/app/api/capture/route.js'),
    journal: await import('@/app/api/journal/route.js'),
    journalEntry: await import('@/app/api/journal/[id]/route.js'),
    captures: await import('@/app/api/captures/route.js'),
    captureById: await import('@/app/api/captures/[id]/route.js'),
    captureUndo: await import('@/app/api/captures/[id]/undo/route.js'),
  };
}

/**
 * @param {string} url
 * @param {unknown} body
 * @param {Record<string, string>} headers
 */
function post(url, body, headers) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const bearer = (/** @type {string} */ token) => ({ authorization: 'Bearer ' + token });

const CAPTURE = { text: 'Reply about the workshop dates' };
const ENTRY = { date: '2026-09-09', text: 'A quiet day.' };

/** @param {Awaited<ReturnType<typeof load>>} app */
const captureCount = async (app) => (await app.store.getCaptures()).length;

describe('POST /api/capture behind the gate', () => {
  it('refuses a proxied request with no token, writing nothing', async () => {
    const app = await load(TOKEN);
    const before = await captureCount(app);

    const response = await app.capture.POST(post('http://localhost/api/capture', CAPTURE, PROXIED));

    expect(response.status).toBe(401);
    expect(await captureCount(app)).toBe(before);
  });

  it('refuses a proxied request with a wrong token, writing nothing', async () => {
    const app = await load(TOKEN);
    const before = await captureCount(app);

    const response = await app.capture.POST(post('http://localhost/api/capture', CAPTURE, { ...PROXIED, ...bearer('wrong') }));

    expect(response.status).toBe(401);
    expect(await captureCount(app)).toBe(before);
  });

  it('refuses a token of the right length that differs', async () => {
    const app = await load(TOKEN);

    const response = await app.capture.POST(
      post('http://localhost/api/capture', CAPTURE, { ...PROXIED, ...bearer('b' + TOKEN.slice(1)) })
    );

    expect(response.status).toBe(401);
  });

  it('files a proxied request with the right token', async () => {
    const app = await load(TOKEN);
    const before = await captureCount(app);

    const response = await app.capture.POST(post('http://localhost/api/capture', CAPTURE, { ...PROXIED, ...bearer(TOKEN) }));

    expect(response.status).toBe(200);
    expect(await captureCount(app)).toBe(before + 1);
  });

  it('files a request without the proxy headers with no token', async () => {
    const app = await load(TOKEN);

    const response = await app.capture.POST(post('http://localhost/api/capture', CAPTURE, {}));

    expect(response.status).toBe(200);
  });

  it('treats any one of the proxy headers as proxied', async () => {
    const app = await load(TOKEN);

    const response = await app.capture.POST(post('http://localhost/api/capture', CAPTURE, { 'tailscale-user-name': 'x' }));

    expect(response.status).toBe(401);
  });

  it('refuses every proxied request when no token is configured, even one that sends a token', async () => {
    const app = await load(undefined);
    const before = await captureCount(app);

    const none = await app.capture.POST(post('http://localhost/api/capture', CAPTURE, PROXIED));
    const empty = await app.capture.POST(post('http://localhost/api/capture', CAPTURE, { ...PROXIED, ...bearer('') }));

    expect(none.status).toBe(401);
    expect(empty.status).toBe(401);
    expect(await captureCount(app)).toBe(before);
  });

  it('still files the Mac\'s own request when no token is configured', async () => {
    const app = await load(undefined);

    const response = await app.capture.POST(post('http://localhost/api/capture', CAPTURE, {}));

    expect(response.status).toBe(200);
  });

  it('carries the receipt as one line of text', async () => {
    const app = await load(TOKEN);

    const body = await (await app.capture.POST(post('http://localhost/api/capture', CAPTURE, {}))).json();

    expect(body.receiptLine).toBe('task · Filed “Reply about the workshop dates”');
  });
});

describe('the journal route behind the gate', () => {
  it('refuses a proxied write with no token or a wrong one, writing nothing', async () => {
    const app = await load(TOKEN);
    const before = (await app.store.getJournalDay(ENTRY.date)).length;

    const none = await app.journal.POST(post('http://localhost/api/journal', ENTRY, PROXIED));
    const wrong = await app.journal.POST(post('http://localhost/api/journal', ENTRY, { ...PROXIED, ...bearer('wrong') }));

    expect(none.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect((await app.store.getJournalDay(ENTRY.date)).length).toBe(before);
  });

  it('files a proxied write with the right token', async () => {
    const app = await load(TOKEN);
    const before = (await app.store.getJournalDay(ENTRY.date)).length;

    const response = await app.journal.POST(post('http://localhost/api/journal', ENTRY, { ...PROXIED, ...bearer(TOKEN) }));

    expect(response.status).toBe(200);
    expect((await app.store.getJournalDay(ENTRY.date)).length).toBe(before + 1);
  });

  it('files a write without the proxy headers with no token', async () => {
    const app = await load(TOKEN);

    const response = await app.journal.POST(post('http://localhost/api/journal', ENTRY, {}));

    expect(response.status).toBe(200);
  });

  it('refuses every proxied write when no token is configured', async () => {
    const app = await load(undefined);

    const response = await app.journal.POST(post('http://localhost/api/journal', ENTRY, { ...PROXIED, ...bearer(TOKEN) }));

    expect(response.status).toBe(401);
  });

  it('refuses a proxied read of a day with no token', async () => {
    const app = await load(TOKEN);

    const response = await app.journal.GET(new Request('http://localhost/api/journal?date=2026-09-09', { headers: PROXIED }));

    expect(response.status).toBe(401);
  });

  it('refuses a proxied change to an entry with no token: the proxied path reaches it too', async () => {
    const app = await load(TOKEN);

    const response = await app.journalEntry.DELETE(
      new Request('http://localhost/api/journal/x', { method: 'DELETE', headers: PROXIED }),
      { params: Promise.resolve({ id: 'x' }) }
    );

    expect(response.status).toBe(401);
  });
});

describe('the capture log routes behind the gate', () => {
  const ctx = { params: Promise.resolve({ id: 'x' }) };

  it("refuses a proxied read of the log with no token, and answers the Mac's own", async () => {
    const app = await load(TOKEN);

    expect((await app.captures.GET(new Request('http://localhost/api/captures', { headers: PROXIED }))).status).toBe(401);
    expect((await app.captures.GET(new Request('http://localhost/api/captures'))).status).toBe(200);
  });

  it('refuses a proxied delete, refile and undo with no token, and lets the right token through', async () => {
    const app = await load(TOKEN);
    const call = (/** @type {string} */ method, /** @type {Record<string, string>} */ headers) =>
      new Request('http://localhost/api/captures/x', { method, headers });

    expect((await app.captureById.DELETE(call('DELETE', PROXIED), ctx)).status).toBe(401);
    expect((await app.captureById.PATCH(call('PATCH', PROXIED), ctx)).status).toBe(401);
    expect((await app.captureUndo.POST(call('POST', PROXIED), ctx)).status).toBe(401);
    // Past the gate: the unknown id is refused by the store, not by the gate.
    expect((await app.captureById.DELETE(call('DELETE', { ...PROXIED, ...bearer(TOKEN) }), ctx)).status).not.toBe(401);
    expect((await app.captureById.DELETE(call('DELETE', {}), ctx)).status).not.toBe(401);
  });
});
