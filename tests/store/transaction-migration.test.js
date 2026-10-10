/**
 * A data file written before ADR 0023 -- positive amounts with a `kind` --
 * migrates to signed amounts the first time it is read, after a backup, and
 * reading it again changes nothing.
 */

import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/store.js')} */
let store;

/** The seed as a v11 file would have held it. */
async function v11File() {
  const seed = JSON.parse(await readFile('data/seed.json', 'utf8'));
  return {
    ...seed,
    schemaVersion: 11,
    transactions: seed.transactions.map((/** @type {any} */ { notCounted, tags, amount, ...rest }) => ({
      ...rest,
      amount: Math.abs(amount),
      kind: rest.counterAccountId !== null ? 'transfer' : amount > 0 ? 'income' : 'expense',
    })),
  };
}

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-v12-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe('a v11 data file', () => {
  it('migrates to signed transactions on its first read, keeping the old file as a backup', async () => {
    const before = JSON.stringify(await v11File(), null, 2);
    const working = path.join(sandbox, 'personalos.json');
    await writeFile(working, before);

    const transactions = await store.getTransactions();

    expect(Object.fromEntries(transactions.map((t) => [t.description, t.amount]))).toEqual({
      'Nordis - December retainer': 250000,
      'Helix Academy - workshop': 80000,
      'Rent January': -95000,
      'Mercado da Ribeira': -6250,
      'To savings': -100000,
    });
    expect(await readFile(working + '.v11.backup', 'utf8')).toBe(before);

    const migrated = await readFile(working, 'utf8');
    await store.getTransactions();
    expect(await readFile(working, 'utf8')).toBe(migrated);
    expect((await readdir(sandbox)).filter((name) => name.endsWith('.backup'))).toEqual(['personalos.json.v11.backup']);
  });
});
