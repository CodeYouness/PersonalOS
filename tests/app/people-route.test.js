/**
 * POST /api/people -- adding a person by name from the CRM panel (#55).
 * Only the user ever creates a person (ADR 0018); this is how.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/people/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-people-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  route = await import('@/app/api/people/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

/** @param {unknown} body */
function post(body) {
  return route.POST(
    new Request('http://localhost/api/people', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

describe('POST /api/people', () => {
  it('adds a person from a name alone, and says it was you', async () => {
    const response = await post({ name: '  Giulia Verdi ' });
    const body = await response.json();

    expect(response.status).toBe(200);
    const person = await store.getPerson(body.person.id);
    expect(person).toMatchObject({ name: 'Giulia Verdi', organization: '', kind: '', note: '', source: 'user' });
  });

  it.each([
    ['a blank name', { name: '   ' }],
    ['no name', {}],
    ['a name that is not text', { name: 42 }],
  ])('refuses %s', async (_label, body) => {
    const before = (await store.getPeople()).length;
    expect((await post(body)).status).toBe(400);
    expect(await store.getPeople()).toHaveLength(before);
  });
});
