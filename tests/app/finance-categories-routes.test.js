/**
 * /api/finance-categories and /api/finance-categories/[id] -- managing two
 * levels of categories from the Finances screen (#136). The real routes
 * against a sandboxed store; every assertion read back through the store.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/finance-categories/route.js')} */
let collection;
/** @type {typeof import('@/app/api/finance-categories/[id]/route.js')} */
let item;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-categories-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  collection = await import('@/app/api/finance-categories/route.js');
  item = await import('@/app/api/finance-categories/[id]/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

/** @param {string} method @param {unknown} body */
function json(method, body) {
  return { method, headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) };
}

/** @param {unknown} body */
function create(body) {
  return collection.POST(new Request('http://localhost/api/finance-categories', json('POST', body)));
}

/** @param {string} id @param {unknown} body */
function change(id, body) {
  return item.PATCH(new Request('http://localhost/api/finance-categories/' + id, json('PATCH', body)), {
    params: Promise.resolve({ id }),
  });
}

/** @param {string} id */
function remove(id) {
  return item.DELETE(new Request('http://localhost/api/finance-categories/' + id, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  });
}

/** @param {string} id */
async function category(id) {
  return (await store.getProfile()).financeCategories.find((row) => row.id === id);
}

describe('POST /api/finance-categories', () => {
  it('adds a top-level category and a subcategory under it', async () => {
    const parent = await (await create({ name: 'Sport', kind: 'expense' })).json();
    const child = await (await create({ name: 'Gym', parentId: parent.category.id, fixedCost: true })).json();

    expect(await category(parent.category.id)).toMatchObject({ name: 'Sport', kind: 'expense', parentId: null });
    expect(await category(child.category.id)).toMatchObject({ name: 'Gym', kind: null, parentId: parent.category.id, fixedCost: true });
  });

  it.each([
    ['a third level', { name: 'Deep', parentId: 'cat_rent' }, /two levels/],
    ['a top-level category with no kind', { name: 'Misc' }, /kind/],
    ['a kind outside the vocabulary', { name: 'Misc', kind: 'transfer' }, /kind/],
    ['a blank name', { name: '  ', kind: 'expense' }, /name/],
    ['a parent that does not exist', { name: 'Misc', parentId: 'cat_nowhere' }, /category/],
    ['a subcategory of the other kind than its parent', { name: 'Misc', parentId: 'cat_home', kind: 'income' }, /parent's kind/],
    ['a subcategory under an archived parent', { name: 'Misc', parentId: 'ARCHIVED' }, /archived/],
    ['a field it does not take', { name: 'Misc', kind: 'expense', archived: true }, /archived/],
  ])('refuses %s, with the reason', async (_label, body, reason) => {
    if ((/** @type {any} */ (body)).parentId === 'ARCHIVED') {
      await store.updateFinanceCategory('cat_transport', { archived: true });
      body = { ...body, parentId: 'cat_transport' };
    }
    const before = (await store.getProfile()).financeCategories.length;

    const response = await create(body);

    expect(response.status).toBe(400);
    const answer = await response.json();
    expect(answer.status).toBe('error');
    expect(answer.message).toMatch(reason);
    expect((await store.getProfile()).financeCategories).toHaveLength(before);
  });
});

describe('POST /api/finance-categories, the body', () => {
  it('refuses a body that is not a JSON object', async () => {
    expect((await create('not json')).status).toBe(400);
  });
});

describe('PATCH /api/finance-categories/[id]', () => {
  it('renames, flags as a fixed cost, archives and restores', async () => {
    await change('cat_groceries', { name: 'Food', fixedCost: true, archived: true });
    expect(await category('cat_groceries')).toMatchObject({ name: 'Food', fixedCost: true, archived: true });

    await change('cat_groceries', { archived: false });
    expect((await category('cat_groceries'))?.archived).toBe(false);
  });

  it('moves a subcategory under another parent of the same kind', async () => {
    await change('cat_rent', { parentId: 'cat_groceries' });

    expect((await category('cat_rent'))?.parentId).toBe('cat_groceries');
  });

  it.each([
    ['a move across kinds', 'cat_rent', { parentId: 'cat_consulting' }, /same kind/],
    ['a parent with children made a subcategory', 'cat_home', { parentId: 'cat_groceries' }, /subcategories/],
    ['a third level', 'cat_groceries', { parentId: 'cat_rent' }, /two levels/],
    ['a kind change on a category in use', 'cat_groceries', { kind: 'income' }, /in use/],
    ['a kind change on a parent whose subcategory is in use', 'cat_home', { kind: 'income' }, /in use/],
    ['a field it does not edit', 'cat_groceries', { id: 'x' }, /id/],
    ['a category made its own parent', 'cat_groceries', { parentId: 'cat_groceries' }, /own parent/],
    ['a subcategory made top-level', 'cat_rent', { parentId: null }, /top-level/],
    ['a kind on a subcategory', 'cat_rent', { kind: 'income' }, /parent's kind/],
    ['a move with a kind other than the new parent\'s', 'cat_transport', { parentId: 'cat_groceries', kind: 'income' }, /parent's kind/],
    ['a move under an archived parent', 'cat_rent', { parentId: 'ARCHIVED' }, /archived/],
  ])('refuses %s, leaving the category as it was', async (_label, id, body, reason) => {
    if ((/** @type {any} */ (body)).parentId === 'ARCHIVED') {
      await store.updateFinanceCategory('cat_groceries', { archived: true });
      body = { ...body, parentId: 'cat_groceries' };
    }
    const before = await category(id);

    const response = await change(id, body);

    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(reason);
    expect(await category(id)).toEqual(before);
  });

  it("takes a subcategory's own parent's kind as no change", async () => {
    expect((await change('cat_rent', { kind: 'expense', name: 'Rent and charges' })).status).toBe(200);
    expect(await category('cat_rent')).toMatchObject({ kind: null, name: 'Rent and charges' });
  });

  it('refuses an empty patch, and answers 404 for a category that does not exist', async () => {
    expect((await change('cat_groceries', {})).status).toBe(400);
    expect((await change('cat_nowhere', { name: 'x' })).status).toBe(404);
  });
});

describe('DELETE /api/finance-categories/[id]', () => {
  it('deletes an unused category with its subcategories', async () => {
    const child = await store.createFinanceCategory({ name: 'Tickets', parentId: 'cat_transport' });

    const response = await remove('cat_transport');

    expect(response.status).toBe(200);
    expect(await category('cat_transport')).toBeUndefined();
    expect(await category(child.id)).toBeUndefined();
  });

  it('refuses a category in use, or whose subcategory is in use', async () => {
    for (const id of ['cat_groceries', 'cat_home']) {
      const response = await remove(id);
      expect(response.status).toBe(400);
      expect((await response.json()).message).toMatch(/in use/);
      expect(await category(id)).toBeDefined();
    }
  });

  it('answers 404 for a category that does not exist', async () => {
    expect((await remove('cat_nowhere')).status).toBe(404);
  });
});
