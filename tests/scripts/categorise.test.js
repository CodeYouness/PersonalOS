/**
 * Categorising the statement movements nothing has described (ADR 0043):
 * the pure plan on made-up records -- transfer pairing, the merchant key,
 * rules learned from what is categorised -- and both phases end to end on a
 * sandbox store, the model stubbed at the provider seam. The key is set
 * before anything is imported, since the environment is read once.
 */

import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StatementBook, fakeAccount, fakeMovement } from './categorise-fixture.js';

const callTool = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ai/provider.js', () => ({ callTool }));

/** @type {string} */
let sandbox;
/** @type {string} */
let files;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/scripts/categorise.js')} */
let script;
/** @type {typeof import('@/scripts/categorise/plan.js')} */
let plan;
/** @type {typeof import('@/scripts/categorise/key.js')} */
let key;
/** @type {typeof import('@/scripts/categorise/review.js')} */
let review;
/** @type {typeof import('@/scripts/categorise/model.js')} */
let model;
/** @type {StatementBook} */
let book;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-categorise-'));
  files = await mkdtemp(path.join(tmpdir(), 'personalos-categorise-files-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ANTHROPIC_MODEL_CATEGORISE = 'claude-test-categorise';
  store = await import('@/lib/store.js');
  script = await import('@/scripts/categorise.js');
  plan = await import('@/scripts/categorise/plan.js');
  key = await import('@/scripts/categorise/key.js');
  review = await import('@/scripts/categorise/review.js');
  model = await import('@/scripts/categorise/model.js');
});

afterAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL_CATEGORISE;
  await rm(sandbox, { recursive: true, force: true });
  await rm(files, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  await store.getProfile();
  await store.removeDemoFinance();
  callTool.mockReset();
  book = new StatementBook(store);
});

const dataFile = () => path.join(sandbox, 'personalos.json');

let reviews = 0;
/** A fresh path for a review file. */
const reviewPath = () => path.join(files, 'review-' + ++reviews + '.csv');

/**
 * @param {{ model?: boolean, window?: number }} [options]
 */
async function propose(options = {}) {
  const at = reviewPath();
  /** @type {string[]} */
  const printed = [];
  const result = await script.proposeCategories({ path: at, ...options, print: (line) => printed.push(line) });
  const text = await readFile(at, 'utf8');
  return { ...result, at, csv: text, read: review.readReview(text), report: printed.join('\n') };
}

/**
 * @param {string} at
 * @param {{ write?: boolean }} [options]
 */
async function apply(at, options = {}) {
  /** @type {string[]} */
  const printed = [];
  const result = await script.applyReview({ path: at, ...options, print: (line) => printed.push(line) });
  return { ...result, report: printed.join('\n') };
}

/**
 * Rewrites the decision of the rows a test picks.
 *
 * @param {string} at
 * @param {(row: string[]) => string | undefined} decide the new decision, or undefined to keep it
 */
async function editDecisions(at, decide) {
  const { parseCsv, formatCsv } = await import('@/scripts/csv.js');
  const [header, ...rows] = parseCsv(await readFile(at, 'utf8'));
  const decision = header.indexOf('decision');
  for (const row of rows) {
    const next = decide(row);
    if (next !== undefined) row[decision] = next;
  }
  await writeFile(at, formatCsv([header, ...rows]));
}

/** @param {string} id */
async function transaction(id) {
  const row = await store.getTransaction(id);
  if (row === null) throw new Error('no transaction ' + id);
  return row;
}

const CARD_PAYMENT = (/** @type {string} */ merchant) => ({ type: 'Addebito', merchant, category: 'Food', subcategory: 'Coffee' });

describe('the merchant key', () => {
  it.each([
    ['PAYPAL *Spotify 12345', 'spotify'],
    ['SumUp *Bar Centrale', 'bar centrale'],
    ['Zettle_*Panificio Due', 'panificio due'],
    ['Payment to Utility Co, ref 12', 'payment to utility co'],
    ['PAGAMENTO POS SUPERMERCATO UNO 03/11 ORE 12:30', 'supermercato uno'],
    ['  Caffè   Rossi  ', 'caffe rossi'],
    ['Salary June', 'salary'],
    ['Interest paid into "Pocket" in data Aug 1, 2026', 'interest paid into pocket'],
    ['Interest paid into "Pocket" in data Sep 30, 2026', 'interest paid into pocket'],
    ['Stripe', 'stripe'],
    ['POS', 'pos'],
    ['12345 / 678', ''],
  ])('reads %j as %j', (text, expected) => {
    expect(key.normaliseKey(text)).toBe(expected);
  });

  it("takes the statement's merchant, then the counterparty, then the description", () => {
    const card = fakeMovement({ account: 'a', date: '2026-02-01', amount: -240, description: 'Coffee Bar', detail: CARD_PAYMENT('COFFEE*BAR 123') });
    const typed = fakeMovement({ account: 'a', date: '2026-02-01', amount: -1000, description: 'Monthly fee', detail: { type: 'Uscita', counterparty: 'Gym Uno Srl' } });
    const plain = fakeMovement({ account: 'a', date: '2026-02-01', amount: -1000, description: 'Bakery 22' });
    const blank = fakeMovement({ account: 'a', date: '2026-02-01', amount: -1000, description: '0042' });
    expect([card, typed, plain, blank].map(key.merchantKey)).toEqual(['coffee bar', 'gym uno srl', 'bakery', key.BLANK_KEY]);
  });
});

describe('transfers between your own accounts', () => {
  const accounts = ['bank', 'savings', 'deposit', 'card'].map((id) => fakeAccount(id));
  /** @param {import('@/lib/domain/types.js').Transaction[]} transactions @param {number} [window] */
  const proposals = (transactions, window = 2) => plan.planProposals({ transactions, accounts, categories: [], window });

  it('pairs a same-day partner before one a day apart', () => {
    const out = fakeMovement({ account: 'bank', date: '2026-02-05', amount: -20000, description: 'To savings' });
    const sameDay = fakeMovement({ account: 'savings', date: '2026-02-05', amount: 20000 });
    const nextDay = fakeMovement({ account: 'deposit', date: '2026-02-06', amount: 20000 });
    const { transfers, ambiguous, groups } = proposals([nextDay, out, sameDay]);
    expect(transfers.map((pair) => [pair.out.id, pair.into.id, pair.distance])).toEqual([[out.id, sameDay.id, 0]]);
    expect(ambiguous).toEqual([]);
    expect(groups.flatMap((group) => group.movements.map((row) => row.id))).toEqual([nextDay.id]);
  });

  it('pairs only within the window', () => {
    const out = fakeMovement({ account: 'bank', date: '2026-02-01', amount: -5000 });
    const into = fakeMovement({ account: 'savings', date: '2026-02-04', amount: 5000 });
    expect(proposals([out, into]).transfers).toEqual([]);
    expect(proposals([out, into], 3).transfers.map((pair) => pair.distance)).toEqual([3]);
  });

  it('pairs none of them when a movement has two equally good partners, and lists them', () => {
    const out = fakeMovement({ account: 'bank', date: '2026-02-03', amount: -5000 });
    const one = fakeMovement({ account: 'savings', date: '2026-02-03', amount: 5000 });
    const two = fakeMovement({ account: 'deposit', date: '2026-02-03', amount: 5000 });
    // A partner a day further does not rescue it: the doubt is at the nearest distance.
    const later = fakeMovement({ account: 'savings', date: '2026-02-04', amount: 5000 });
    const { transfers, ambiguous } = proposals([out, one, two, later]);
    expect(transfers).toEqual([]);
    expect(ambiguous.map((row) => row.id)).toEqual([out.id, one.id, two.id]);
  });

  it("never pairs a card's own row, a card payment, a fee or interest by the bank's movement type", () => {
    const rows = [
      [fakeMovement({ account: 'card', date: '2026-02-07', amount: -3000, detail: CARD_PAYMENT('SHOP') }), fakeMovement({ account: 'bank', date: '2026-02-07', amount: 3000 })],
      [fakeMovement({ account: 'bank', date: '2026-02-08', amount: -4000, detail: { type: 'Pagamento con carta', product: 'Attuale' } }), fakeMovement({ account: 'savings', date: '2026-02-08', amount: 4000 })],
      [fakeMovement({ account: 'bank', date: '2026-02-09', amount: -100, detail: { type: 'COMMISSIONI/SPESE' } }), fakeMovement({ account: 'savings', date: '2026-02-09', amount: 100 })],
      [fakeMovement({ account: 'bank', date: '2026-02-10', amount: -16, detail: { type: 'Rimborso' } }), fakeMovement({ account: 'deposit', date: '2026-02-10', amount: 16, detail: { type: 'Interessi', product: 'Deposito' } })],
    ].flat();
    const result = proposals(rows);
    expect(result.transfers).toEqual([]);
    expect(result.excluded).toBe(5);
  });

  it('never pairs two movements of one account, or one that is no longer open', () => {
    const out = fakeMovement({ account: 'bank', date: '2026-02-11', amount: -900 });
    const sameAccount = fakeMovement({ account: 'bank', date: '2026-02-11', amount: 900 });
    const categorised = fakeMovement({ account: 'savings', date: '2026-02-11', amount: 900, categoryId: 'cat_consulting' });
    expect(proposals([out, sameAccount, categorised]).transfers).toEqual([]);
  });

  it("says when the bank's movement type confirms a pair", () => {
    const topUp = [
      fakeMovement({ account: 'bank', date: '2026-02-12', amount: -1000, detail: { type: 'GIROCONTO/BONIFICO' } }),
      fakeMovement({ account: 'card', date: '2026-02-12', amount: 1000, detail: { type: 'Ricarica', product: 'Attuale' } }),
    ];
    const plain = [
      fakeMovement({ account: 'bank', date: '2026-02-13', amount: -2500, detail: { type: 'Uscita' } }),
      fakeMovement({ account: 'savings', date: '2026-02-13', amount: 2500, detail: { type: 'Entrata' } }),
    ];
    expect(proposals([...topUp, ...plain]).transfers.map((pair) => pair.confirmed)).toEqual([true, false]);
  });

  it('only pairs cash accounts', () => {
    const broker = fakeAccount('broker', 'investment');
    const out = fakeMovement({ account: 'bank', date: '2026-02-14', amount: -10000 });
    const into = fakeMovement({ account: 'broker', date: '2026-02-14', amount: 10000 });
    expect(plan.planProposals({ transactions: [out, into], accounts: [...accounts, broker], categories: [], window: 2 }).transfers).toEqual([]);
  });
});

describe('rules learned from what is already categorised', () => {
  const accounts = [fakeAccount('card'), fakeAccount('bank')];

  it('proposes the category every categorised movement of the key agrees on, in either direction, not counted when they all are', async () => {
    const categories = (await store.getProfile()).financeCategories;
    const rows = [
      fakeMovement({ account: 'card', date: '2026-01-05', amount: -240, detail: CARD_PAYMENT('COFFEE*BAR 123'), categoryId: 'cat_eating_out' }),
      fakeMovement({ account: 'card', date: '2026-01-09', amount: -310, detail: CARD_PAYMENT('COFFEE*BAR 456'), categoryId: 'cat_eating_out' }),
      fakeMovement({ account: 'bank', date: '2026-01-15', amount: -30000, description: 'Broker Uno deposit 0001', categoryId: 'cat_home', notCounted: true }),
    ];
    const open = [
      fakeMovement({ account: 'card', date: '2026-02-03', amount: -260, detail: CARD_PAYMENT('COFFEE*BAR 999') }),
      fakeMovement({ account: 'card', date: '2026-02-04', amount: 260, detail: { type: 'Rimborso', merchant: 'COFFEE*BAR 999' } }),
      fakeMovement({ account: 'bank', date: '2026-02-15', amount: -30000, description: 'Broker Uno deposit 0002' }),
    ];
    const { groups } = plan.planProposals({ transactions: [...rows, ...open], accounts, categories, window: 2 });
    expect(groups.map((group) => [group.key, group.direction, group.proposal, group.source])).toEqual([
      ['broker uno deposit', 'out', { categoryId: 'cat_home', notCounted: true }, 'rule'],
      ['coffee bar', 'out', { categoryId: 'cat_eating_out', notCounted: false }, 'rule'],
      ['coffee bar', 'in', { categoryId: 'cat_eating_out', notCounted: false }, 'rule'],
    ]);
    expect(groups[1].why).toBe('2 categorised movement(s) with this key agree');
  });

  it('proposes nothing for a key whose categorised movements disagree, and says on what', async () => {
    const categories = (await store.getProfile()).financeCategories;
    const rows = [
      fakeMovement({ account: 'card', date: '2026-01-05', amount: -2000, description: 'Market Due', categoryId: 'cat_groceries' }),
      fakeMovement({ account: 'card', date: '2026-01-06', amount: -2000, description: 'Market Due', categoryId: 'cat_groceries' }),
      fakeMovement({ account: 'card', date: '2026-01-07', amount: -2000, description: 'MARKET DUE 77', categoryId: 'cat_utilities' }),
      fakeMovement({ account: 'card', date: '2026-02-07', amount: -1500, description: 'Market Due' }),
    ];
    const [group] = plan.planProposals({ transactions: rows, accounts, categories, window: 2 }).groups;
    expect(group).toMatchObject({ key: 'market due', proposal: null, source: '', conflict: [{ categoryId: 'cat_groceries', count: 2 }, { categoryId: 'cat_utilities', count: 1 }] });
    expect(group.why).toBe('categorised before as Groceries (2), Home > Utilities (1): nothing proposed');
  });

  it('proposes nothing from an archived category', async () => {
    const archived = await store.createFinanceCategory({ name: 'Old habits', kind: 'expense' });
    await store.updateFinanceCategory(archived.id, { archived: true });
    const categories = (await store.getProfile()).financeCategories;
    const rows = [
      fakeMovement({ account: 'card', date: '2026-01-05', amount: -800, description: 'Kiosk', categoryId: archived.id }),
      fakeMovement({ account: 'card', date: '2026-02-05', amount: -800, description: 'Kiosk' }),
    ];
    const [group] = plan.planProposals({ transactions: rows, accounts, categories, window: 2 }).groups;
    expect(group.proposal).toBeNull();
    expect(group.why).toMatch(/Old habits, which is archived/);
  });
});

describe('the model, with --model', () => {
  /** A reply naming categories by the references it was sent. */
  const reply = (/** @type {Record<string, string | null>} */ answers) => ({
    input: { answers: Object.entries(answers).map(([ref, categoryId]) => ({ ref, categoryId })) },
    stopReason: 'tool_use',
    usage: null,
  });

  it('sends the key, a sample with its digits masked, the direction and the bank category -- nothing else of yours', async () => {
    const books = await book.move({ account: 'Conto Alfa', date: '2026-02-03', amount: -1250, description: 'BOOKS LTD 4411 12.50', detail: { type: 'Addebito', merchant: 'BOOKS LTD 4411', category: 'Shopping', subcategory: 'Books' } });
    const client = await book.move({ account: 'Conto Alfa', date: '2026-02-04', amount: 9900, description: 'Client Zeta invoice 7' });
    callTool.mockResolvedValue(reply({ k1: null, k2: null }));

    await propose({ model: true });

    expect(callTool).toHaveBeenCalledTimes(1);
    const request = callTool.mock.calls[0][0];
    expect(request.model).toBe('claude-test-categorise');
    const sent = JSON.parse(request.messages[0].content);
    expect(sent.movements).toEqual([
      { ref: 'k1', key: 'books ltd', sample: 'BOOKS LTD # #.#', direction: 'out', bankCategory: 'Shopping > Books' },
      { ref: 'k2', key: 'client zeta invoice', sample: 'Client Zeta invoice #', direction: 'in' },
    ]);
    expect(sent.categories).toContainEqual({ id: 'cat_rent', path: 'Home > Rent', kind: 'spending' });
    expect(sent.categories).toContainEqual({ id: 'cat_consulting', path: 'Consulting', kind: 'income' });
    const everything = JSON.stringify(request);
    for (const secret of ['Conto Alfa', books.accountId, '2026-02', '12.50', '1250', '9900', '99.00', books.id, client.id]) expect(everything).not.toContain(secret);
  });

  it('keeps an id it sent, and drops an id it did not send, a key it did not send and a second answer for one key', async () => {
    await book.move({ account: 'Conto', date: '2026-02-03', amount: -1250, description: 'Books Ltd' });
    await book.move({ account: 'Conto', date: '2026-02-04', amount: -700, description: 'Tram Line' });
    await book.move({ account: 'Conto', date: '2026-02-05', amount: -3000, description: 'Gadget Shop' });
    callTool.mockResolvedValue({
      input: {
        answers: [
          { ref: 'k1', categoryId: 'cat_invented' },
          { ref: 'k3', categoryId: 'cat_transport' },
          { ref: 'k3', categoryId: 'cat_groceries' },
          { ref: 'k9', categoryId: 'cat_groceries' },
          { ref: 'k2', categoryId: null },
          'nonsense',
        ],
      },
      stopReason: 'tool_use',
      usage: null,
    });

    const { plan: proposed, read, report } = await propose({ model: true });

    const byKey = Object.fromEntries(proposed.groups.map((group) => [group.key, [group.proposal?.categoryId ?? null, group.source]]));
    expect(byKey).toEqual({ 'books ltd': [null, ''], 'tram line': ['cat_transport', 'model'], 'gadget shop': [null, ''] });
    expect(read.rows.find((row) => row.key === 'tram line')?.decision).toBe('Transport');
    expect(report).toMatch(/Model: 1 call\(s\) about 3 key\(s\); 1 proposed, 1 with no category that fits, 4 answer\(s\) dropped/);
  });

  it('shows, and does not pre-fill, an answer against the direction of the money', async () => {
    await book.move({ account: 'Conto', date: '2026-02-03', amount: 90000, description: 'Trattoria Luna' });
    await book.move({ account: 'Conto', date: '2026-02-04', amount: -700, description: 'Client Zeta' });
    await book.move({ account: 'Conto', date: '2026-02-05', amount: 5000, description: 'Client Yota' });
    const picks = { 'trattoria luna': 'cat_groceries', 'client zeta': 'cat_consulting', 'client yota': 'cat_consulting' };
    callTool.mockImplementation(async (request) => {
      const sent = JSON.parse(request.messages[0].content);
      return reply(Object.fromEntries(sent.movements.map((/** @type {{ ref: string, key: 'client yota' }} */ row) => [row.ref, picks[row.key]])));
    });

    const { plan: proposed, read, report, csv } = await propose({ model: true });

    const byKey = Object.fromEntries(proposed.groups.map((group) => [group.key, [group.proposal?.categoryId ?? null, group.source]]));
    expect(byKey).toEqual({ 'trattoria luna': [null, ''], 'client zeta': [null, ''], 'client yota': ['cat_consulting', 'model'] });
    expect(read.rows.find((row) => row.key === 'trattoria luna')?.decision).toBe('');
    expect(csv).toMatch(/the model suggested ""Groceries"", not proposed: money in under a spending category counts as a refund/);
    expect(csv).toMatch(/the model suggested ""Consulting"", not proposed: money out under an income category counts as a chargeback/);
    expect(report).toMatch(/2 of the proposed go against the direction of the money/);
  });

  it('tolerates a call that fails or is cut off: those keys stay without a proposal', async () => {
    await book.move({ account: 'Conto', date: '2026-02-03', amount: -1250, description: 'Books Ltd' });
    await book.move({ account: 'Conto', date: '2026-02-04', amount: -700, description: 'Tram Line' });
    await book.move({ account: 'Conto', date: '2026-02-05', amount: -3000, description: 'Gadget Shop' });
    callTool
      .mockRejectedValueOnce(new Error('overloaded'))
      .mockResolvedValueOnce({ input: { answers: [{ ref: 'k3', categoryId: 'cat_groceries' }] }, stopReason: 'max_tokens', usage: null });

    const result = await model.proposeByModel(
      [
        { key: 'books ltd', direction: 'out', sample: 'Books Ltd', bankCategory: '' },
        { key: 'tram line', direction: 'out', sample: 'Tram Line', bankCategory: '' },
        { key: 'gadget shop', direction: 'out', sample: 'Gadget Shop', bankCategory: '' },
      ],
      (await store.getProfile()).financeCategories,
      { batchSize: 2 }
    );
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ outcome: 'asked', calls: 2, failedCalls: 2, failedItems: 3, errors: ['overloaded', 'the reply was cut off at max_tokens'] });
    expect(result.outcome === 'asked' && result.answers.size).toBe(0);

    callTool.mockReset();
    callTool.mockRejectedValue(new Error('overloaded'));
    const end = await propose({ model: true });
    expect(end.plan.groups.every((group) => group.proposal === null)).toBe(true);
    expect(end.report).toMatch(/1 call\(s\) failed; their 3 key\(s\) stay without a proposal:\n {4}overloaded/);
  });

  it('is not asked without --model, nor about a key a rule covers or one that disagrees', async () => {
    await book.move({ account: 'Conto', date: '2026-01-03', amount: -1250, description: 'Books Ltd', categoryId: 'cat_groceries' });
    await book.move({ account: 'Conto', date: '2026-02-03', amount: -1250, description: 'Books Ltd' });
    const off = await propose();
    expect(callTool).not.toHaveBeenCalled();
    expect(off.report).toMatch(/proposed by the model: not asked \(run with --model to ask\)/);

    await propose({ model: true });
    expect(callTool).not.toHaveBeenCalled();
  });
});

describe('the review file', () => {
  it('lists a row per transfer pair and per group, and reads back what it wrote', async () => {
    const out = await book.move({ account: 'Conto', date: '2026-02-05', amount: -20000, description: 'Giroconto verso risparmio', detail: { type: 'GIROCONTO/BONIFICO' } });
    const into = await book.move({ account: 'Risparmio', date: '2026-02-05', amount: 20000, description: 'Giroconto da conto', detail: { type: 'Entrata' } });
    await book.move({ account: 'Conto', date: '2026-01-10', amount: -1800, description: 'Market, Uno "centro"', categoryId: 'cat_groceries' });
    const a = await book.move({ account: 'Conto', date: '2026-02-10', amount: -2200, description: 'Market, Uno "centro"' });
    const b = await book.move({ account: 'Conto', date: '2026-02-17', amount: -1300, description: 'MARKET, UNO "CENTRO" 22' });
    const c = await book.move({ account: 'Conto', date: '2026-02-20', amount: -4500, description: 'Hardware Store' });

    const { csv, read, at } = await propose();

    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(review.REVIEW_HEADER.join(','));
    expect(lines[1]).toBe(
      'transfer,,,Giroconto verso risparmio / Giroconto da conto,2,200.00,2026-02-05,2026-02-05,Conto -> Risparmio,,transfer,transfer,' +
        "same day; the bank's movement type says transfer,transfer," + out.id + ' ' + into.id
    );
    expect(lines[2]).toBe(
      'group,market uno centro,out,"Market, Uno ""centro""",2,-35.00,2026-02-10,2026-02-17,Conto,,Groceries,rule,' +
        '1 categorised movement(s) with this key agree,Groceries,' + a.id + ' ' + b.id
    );
    expect(lines[3]).toBe('group,hardware store,out,Hardware Store,1,-45.00,2026-02-20,2026-02-20,Conto,,,,,,' + c.id);
    expect(read).toEqual({
      problems: [],
      rows: [
        { line: 2, row: 'transfer', key: '', direction: '', decision: 'transfer', ids: [out.id, into.id] },
        { line: 3, row: 'group', key: 'market uno centro', direction: 'out', decision: 'Groceries', ids: [a.id, b.id] },
        { line: 4, row: 'group', key: 'hardware store', direction: 'out', decision: '', ids: [c.id] },
      ],
    });
    await expect(script.proposeCategories({ path: at, print: () => {} })).rejects.toThrow(/already exists/);
  });

  it('prints spending and income over the open days, before and if every proposal is kept', async () => {
    await book.move({ account: 'Conto', date: '2026-02-05', amount: -20000, description: 'To savings', detail: { type: 'GIROCONTO/BONIFICO' } });
    await book.move({ account: 'Risparmio', date: '2026-02-05', amount: 20000, description: 'From current' });
    await book.move({ account: 'Conto', date: '2026-01-10', amount: -1800, description: 'Market Uno', categoryId: 'cat_groceries' });
    await book.move({ account: 'Conto', date: '2026-02-10', amount: -2200, description: 'Market Uno' });

    const { report } = await propose();
    expect(report).toMatch(/Spending and income on every account, 2026-02-05 to 2026-02-10:/);
    expect(report).toMatch(/before +spending +222\.00 +income +200\.00 +of them uncategorised: spending 222\.00, income 200\.00/);
    expect(report).toMatch(/if every proposal is kept +spending +22\.00 +income +0\.00 +of them uncategorised: spending 0\.00, income 0\.00/);
    expect(report).toMatch(/1 pair\(s\) proposed \(same day: 1\), 1 confirmed/);
  });

  it('refuses a file whose header is not a review file\'s', async () => {
    const at = reviewPath();
    await writeFile(at, 'row;key;decision\r\n');
    await expect(apply(at)).rejects.toThrow(/header is not a review file's; missing: row, key.*save it as CSV with commas/);
  });
});

describe('applying the review', () => {
  it('fills what the decisions say, after a backup; a rerun changes nothing and takes no backup', async () => {
    const out = await book.move({ account: 'Conto', date: '2026-02-05', amount: -20000, description: 'To savings', detail: { type: 'GIROCONTO/BONIFICO' } });
    const into = await book.move({ account: 'Risparmio', date: '2026-02-05', amount: 20000, description: 'From current' });
    await book.move({ account: 'Conto', date: '2026-01-10', amount: -1800, description: 'Market Uno', categoryId: 'cat_groceries' });
    const market = await book.move({ account: 'Conto', date: '2026-02-10', amount: -2200, description: 'Market Uno' });
    const tram = await book.move({ account: 'Conto', date: '2026-02-11', amount: -150, description: 'Tram Line' });
    const broker = await book.move({ account: 'Conto', date: '2026-02-12', amount: -50000, description: 'Broker Uno' });
    const { at } = await propose();
    await editDecisions(at, (row) => (row[1] === 'tram line' ? 'transport' : row[1] === 'broker uno' ? 'Home (not counted)' : undefined));

    const before = await readFile(dataFile(), 'utf8');
    const dry = await apply(at);
    expect(await readFile(dataFile(), 'utf8')).toBe(before);
    expect(dry.blocking).toEqual([]);
    expect(dry.report).toMatch(/dry run: nothing was written/);
    expect(dry.report).toMatch(/Transfer rows: 1 accepted, 0 rejected \(decision emptied\), 0 skipped/);
    expect(dry.report).toMatch(/Group rows: 3 decided, 0 skipped/);
    expect(dry.report).toMatch(/Movements to fill: 5 -- a category on 3, not counted on 3/);
    expect(dry.report).toMatch(/before +spending +723\.50 +income +200\.00/);
    expect(dry.report).toMatch(/after +spending +23\.50 +income +0\.00/);
    expect(dry.report).toMatch(/Nothing blocks the apply/);

    const written = await apply(at, { write: true });
    expect(written.backupPath).toBeDefined();
    expect(await readFile(/** @type {string} */ (written.backupPath), 'utf8')).toBe(before);
    expect(written.report).toMatch(/Filled 5 movement\(s\)/);
    for (const leg of [out, into]) expect(await transaction(leg.id)).toMatchObject({ notCounted: true, counterAccountId: null, categoryId: null });
    expect(await transaction(market.id)).toMatchObject({ categoryId: 'cat_groceries', notCounted: false });
    expect(await transaction(tram.id)).toMatchObject({ categoryId: 'cat_transport', notCounted: false });
    expect(await transaction(broker.id)).toMatchObject({ categoryId: 'cat_home', notCounted: true });

    const after = await readFile(dataFile(), 'utf8');
    const again = await apply(at, { write: true });
    expect(again.backupPath).toBeUndefined();
    expect(again.report).toBe('Nothing to change: the review is already applied.');
    expect(await readFile(dataFile(), 'utf8')).toBe(after);
  });

  it("fills only what is still empty: a movement you categorised since is left alone, a new one of the key is filled, a note is kept", async () => {
    await book.move({ account: 'Conto', date: '2026-01-10', amount: -1800, description: 'Market Uno', categoryId: 'cat_groceries' });
    const mine = await book.move({ account: 'Conto', date: '2026-02-10', amount: -2200, description: 'Market Uno' });
    const noted = await book.move({ account: 'Conto', date: '2026-02-11', amount: -900, description: 'Market Uno' });
    const { at } = await propose();

    await store.updateTransaction(mine.id, { categoryId: 'cat_eating_out' });
    await store.updateTransaction(noted.id, { note: 'for the party', tags: ['party'] });
    const late = await book.move({ account: 'Conto', date: '2026-02-25', amount: -1100, description: 'MARKET UNO 0099' });
    const income = await book.move({ account: 'Conto', date: '2026-02-26', amount: 1100, description: 'Market Uno' });

    const { report } = await apply(at, { write: true });
    expect(await transaction(mine.id)).toMatchObject({ categoryId: 'cat_eating_out' });
    expect(await transaction(noted.id)).toMatchObject({ categoryId: 'cat_groceries', note: 'for the party', tags: ['party'] });
    expect(await transaction(late.id)).toMatchObject({ categoryId: 'cat_groceries' });
    // Money in is another direction, another row: the review did not decide it.
    expect(await transaction(income.id)).toMatchObject({ categoryId: null });
    expect(report).toMatch(/Movements to fill: 2 -- a category on 2, not counted on 0/);
    expect(report).toMatch(/imported since the review, or a transfer you rejected: 1/);
    expect(report).toMatch(/categorised, made a transfer or not counted since -- left alone: 1/);
  });

  it('rejects a transfer whose decision is emptied, and skips one a leg of which was categorised since', async () => {
    const out = await book.move({ account: 'Conto', date: '2026-02-05', amount: -20000, description: 'To savings' });
    const into = await book.move({ account: 'Risparmio', date: '2026-02-05', amount: 20000, description: 'From current' });
    const out2 = await book.move({ account: 'Conto', date: '2026-02-15', amount: -3000, description: 'To card' });
    const into2 = await book.move({ account: 'Carta', date: '2026-02-15', amount: 3000, description: 'Top-up' });
    const { at } = await propose();
    await editDecisions(at, (row) => (row[0] === 'transfer' && row[14].startsWith(out.id) ? '' : undefined));
    await store.updateTransaction(into2.id, { categoryId: 'cat_consulting' });

    const { report } = await apply(at);
    expect(report).toMatch(/Nothing to change: the review is already applied/);
    expect(report).toMatch(/Transfer rows: 0 accepted, 1 rejected \(decision emptied\), 1 skipped/);
    expect(report).toMatch(/line 3: a movement was categorised, made a transfer or not counted since; both are left alone/);
    for (const leg of [out, into, out2]) expect(await transaction(leg.id)).toMatchObject({ notCounted: false, categoryId: null });
  });

  it('blocks on a category that does not exist, writing nothing and taking no backup', async () => {
    await book.move({ account: 'Conto', date: '2026-02-10', amount: -2200, description: 'Market Uno' });
    await book.move({ account: 'Conto', date: '2026-02-11', amount: -150, description: 'Tram Line' });
    await book.move({ account: 'Conto', date: '2026-02-12', amount: -150, description: 'Bus Line' });
    const { at } = await propose();
    await editDecisions(at, (row) =>
      row[1] === 'market uno' ? 'Nowhere > Nothing' : row[1] === 'tram line' ? 'Groceries' : row[1] === 'bus line' ? 'transfer' : undefined
    );

    const dry = await apply(at);
    // Groups of one movement each come key by key: bus line, market uno, tram line.
    expect(dry.blocking).toEqual([
      expect.stringMatching(/^review line 2 \("bus line", out\): "transfer" is for a transfer row/),
      'review line 3 ("market uno", out): no category "Nowhere"',
    ]);
    expect(dry.report).toMatch(/The apply would be refused: 2 problem\(s\)/);

    const before = await readFile(dataFile(), 'utf8');
    await expect(apply(at, { write: true })).rejects.toThrow(/refused, nothing was written:\n {2}review line 2 [\s\S]*no category "Nowhere"/);
    expect(await readFile(dataFile(), 'utf8')).toBe(before);
  });
});

describe('a decision', () => {
  it('names a category by its path, in any case, with or without "(not counted)", or says "not counted" alone', async () => {
    const categories = (await store.getProfile()).financeCategories;
    expect(plan.resolveDecision('  home >  rent ', categories)).toEqual({ kind: 'set', proposal: { categoryId: 'cat_rent', notCounted: false } });
    expect(plan.resolveDecision('Home > Rent (not counted)', categories)).toEqual({ kind: 'set', proposal: { categoryId: 'cat_rent', notCounted: true } });
    expect(plan.resolveDecision('Not counted', categories)).toEqual({ kind: 'set', proposal: { categoryId: null, notCounted: true } });
    expect(plan.resolveDecision('', categories)).toEqual({ kind: 'skip' });
    expect(plan.resolveDecision('Home > Nope', categories)).toEqual({ kind: 'error', reason: 'no category "Nope" under "Home"' });
    expect(plan.resolveDecision('A > B > C', categories)).toMatchObject({ kind: 'error', reason: expect.stringMatching(/is not a category/) });
  });
});

describe('the command line', () => {
  it('reads either phase and its options', () => {
    expect(script.parseArgs(['--review', 'r.csv'])).toEqual({ mode: 'review', path: 'r.csv', model: false, window: 2 });
    expect(script.parseArgs(['--review', 'r.csv', '--model', '--window', '3'])).toEqual({ mode: 'review', path: 'r.csv', model: true, window: 3 });
    expect(script.parseArgs(['--apply', 'r.csv', '--write'])).toEqual({ mode: 'apply', path: 'r.csv', write: true });
  });

  it('refuses what it does not understand', () => {
    expect(() => script.parseArgs([])).toThrow(/name one file/);
    expect(() => script.parseArgs(['--review', 'a.csv', '--apply', 'b.csv'])).toThrow(/name one file/);
    expect(() => script.parseArgs(['--review', 'a.csv', '--write'])).toThrow(/--write goes with --apply/);
    expect(() => script.parseArgs(['--apply', 'a.csv', '--model'])).toThrow(/go with --review/);
    expect(() => script.parseArgs(['--review', 'a.csv', '--window', '8'])).toThrow(/whole number of days from 0 to 7/);
    expect(() => script.parseArgs(['--review'])).toThrow(/--review needs a value/);
    expect(() => script.parseArgs(['--review', 'a.csv', '--colour'])).toThrow(/unknown option --colour/);
  });
});
