/**
 * `npm run data:remove-demo-finance` (#112): the seed's demo accounts,
 * balances, trades, transactions and snapshot leave a real data file, after a
 * backup, and nothing of yours goes with them.
 */

import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-demo-finance-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

/** A real account of yours, with a balance and a link from a task. */
async function addYourOwnAccount() {
  const account = await store.createAccount({ name: 'My bank', kind: 'cash' });
  const observation = await store.recordObservation({
    accountId: account.id, kind: 'balance', amount: 123400, date: '2026-04-02',
  });
  const [task] = await store.getTasks();
  await store.createLink({ from: task.id, to: account.id, rel: 'about' });
  return { account, observation };
}

describe('removeDemoFinance', () => {
  it('backs up the data file before anything is removed', async () => {
    const { backupPath } = await store.removeDemoFinance();

    const backedUp = JSON.parse(await readFile(backupPath, 'utf8'));
    expect(backedUp.accounts.map((/** @type {any} */ a) => a.id)).toContain('account_seed_current');
    expect(backedUp.snapshots).toHaveLength(1);
  });

  it('removes the demo accounts, balances, transactions and snapshot', async () => {
    const { removed } = await store.removeDemoFinance();

    expect(await store.getAccounts()).toEqual([]);
    expect(await store.getObservations({})).toEqual([]);
    expect(await store.getTransactions()).toEqual([]);
    expect(await store.getSnapshots()).toEqual([]);
    expect(await store.getTrades()).toEqual([]);
    expect(removed).toEqual({
      accounts: 5, observations: 4, trades: 3, prices: 0, transactions: 5, snapshots: 1, links: 0,
    });
  });

  it('keeps your own accounts and balances, and the links to them', async () => {
    const { account, observation } = await addYourOwnAccount();

    await store.removeDemoFinance();

    expect((await store.getAccounts()).map((a) => a.id)).toEqual([account.id]);
    expect((await store.getObservations({})).map((o) => o.id)).toEqual([observation.id]);
    expect(await store.getLinks({ to: account.id })).toHaveLength(1);
  });

  it('removes a link pointing at a demo row', async () => {
    const [task] = await store.getTasks();
    await store.createLink({ from: task.id, to: 'account_seed_portfolio', rel: 'about' });

    const { removed } = await store.removeDemoFinance();

    expect(removed.links).toBe(1);
    expect(await store.getLinks({ to: 'account_seed_portfolio' })).toEqual([]);
    expect(await store.getLinks({ from: task.id })).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ to: 'account_seed_portfolio' })])
    );
  });

  it('leaves the finance categories and every non-finance row alone', async () => {
    const before = {
      profile: await store.getProfile(),
      tasks: await store.getTasks(),
      goals: await store.getGoals(),
      people: await store.getPeople(),
      captures: await store.getCaptures(),
      links: await store.getLinks({}),
    };

    await store.removeDemoFinance();

    expect(await store.getProfile()).toEqual(before.profile);
    expect(before.profile.financeCategories.length).toBeGreaterThan(0);
    expect(await store.getTasks()).toEqual(before.tasks);
    expect(await store.getGoals()).toEqual(before.goals);
    expect(await store.getPeople()).toEqual(before.people);
    expect(await store.getCaptures()).toEqual(before.captures);
    expect(await store.getLinks({})).toEqual(before.links);
  });

  it('is harmless the second time', async () => {
    await addYourOwnAccount();
    await store.removeDemoFinance();
    const accounts = await store.getAccounts();
    const observations = await store.getObservations({});

    const { removed } = await store.removeDemoFinance();

    expect(removed).toEqual({
      accounts: 0, observations: 0, trades: 0, prices: 0, transactions: 0, snapshots: 0, links: 0,
    });
    expect(await store.getAccounts()).toEqual(accounts);
    expect(await store.getObservations({})).toEqual(observations);
  });
});
