/**
 * The stream route (#293): behind the phone gate, an event stream that sends
 * one data-less message per store change.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const TOKEN = 'a-made-up-token-for-tests';
const PROXIED = { 'x-forwarded-for': '100.64.0.7', 'tailscale-user-login': 'someone@example.com' };

/** @type {string} */
let sandbox;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-changes-route-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('DATA_DIR', sandbox);
  vi.stubEnv('PERSONALOS_PHONE_TOKEN', TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/changes', () => {
  it('refuses a proxied request with no token', async () => {
    const route = await import('@/app/api/changes/route.js');

    const response = await route.GET(new Request('http://localhost/api/changes', { headers: PROXIED }));

    expect(response.status).toBe(401);
  });

  it('streams text/event-stream and sends one message per write, carrying nothing', async () => {
    const route = await import('@/app/api/changes/route.js');
    const store = await import('@/lib/store.js');
    const controller = new AbortController();

    const response = await route.GET(new Request('http://localhost/api/changes', { signal: controller.signal }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');

    const reader = /** @type {ReadableStream<Uint8Array>} */ (response.body).getReader();
    const decoder = new TextDecoder();
    const opening = decoder.decode((await reader.read()).value);
    expect(opening).toContain('retry:');

    await store.updateProfile({ name: 'A made-up name' });
    const message = decoder.decode((await reader.read()).value);
    expect(message).toBe('event: change\ndata: {}\n\n');

    controller.abort();
  });

  it('stops listening to the store when the client goes away', async () => {
    const route = await import('@/app/api/changes/route.js');
    const changes = await import('@/lib/changes.js');
    const controller = new AbortController();

    await route.GET(new Request('http://localhost/api/changes', { signal: controller.signal }));
    expect(changes.listenerCount()).toBe(1);
    controller.abort();

    expect(changes.listenerCount()).toBe(0);
  });
});
