/**
 * /api/questions when the archive may be too large to ask over whole (#175,
 * ADR 0028): the size budget is LOWERED IN THE TEST, not met with a huge
 * seed. The SDK is mocked and a key is set before anything is imported. The
 * route is the seam -- what the model was sent, and what the panel is told.
 *
 * `limits` is frozen, so the mock builds a new object whose two budget
 * fields read from `budget`: a test moves the line without remocking.
 */

import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const budget = vi.hoisted(() => ({ maxChars: Number.MAX_SAFE_INTEGER, recentMonths: 3 }));

vi.mock('@/personalos.config.js', async (importOriginal) => {
  const original = /** @type {typeof import('@/personalos.config.js')} */ (await importOriginal());
  return {
    ...original,
    limits: {
      ...original.limits,
      get contextMaxChars() {
        return budget.maxChars;
      },
      get contextRecentMonths() {
        return budget.recentMonths;
      },
    },
  };
});

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function MockAnthropic() {
    return { messages: { create: mockCreate } };
  }),
}));

/** Thursday 24 September 2026, noon in Rome. */
const NOON = new Date('2026-09-24T10:00:00Z');

/**
 * @typedef {{ id: string, type: string, label: string, content: string, labels: string[] }} Item
 * @typedef {{ today: string, week: { from: string, to: string }, timezone: string, trackedSince: string | null, summarised: { before: string } | null, items: Item[] }} Sent
 */

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/questions/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/ai/context/index.js')} */
let contextModule;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-questions-budget-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  route = await import('@/app/api/questions/route.js');
  store = await import('@/lib/store.js');
  contextModule = await import('@/lib/ai/context/index.js');
});

afterAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  mockCreate.mockReset();
  budget.maxChars = Number.MAX_SAFE_INTEGER;
  budget.recentMonths = 3;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON);
});

afterEach(() => {
  vi.useRealTimers();
});

/** @param {unknown[]} statements @param {{ notInData?: boolean }} [rest] */
function modelAnswers(statements, rest = {}) {
  mockCreate.mockResolvedValueOnce({ content: [{ type: 'tool_use', input: { statements, ...rest } }] });
}

/** @param {string} [question] */
function ask(question = 'What did I spend?') {
  return route.POST(
    new Request('http://localhost/api/questions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question }),
    })
  );
}

/** The working file, byte for byte. */
async function workingFile() {
  return readFile(path.join(sandbox, 'personalos.json'), 'utf8');
}

/** The request the model was sent, taken apart: the raw JSON of the block too. */
function sentRequest() {
  const [request] = mockCreate.mock.calls[0];
  /** @type {{ text: string }[]} */
  const blocks = request.messages[0].content;
  const data = blocks.find((block) => block.text.includes('<context>'))?.text ?? '';
  const json = data.slice(data.indexOf('<context>\n') + '<context>\n'.length, data.indexOf('\n</context>'));
  return { request, json, context: /** @type {Sent} */ (JSON.parse(json)) };
}

/** @param {Sent} context @returns {Set<string>} */
function ids(context) {
  return new Set(context.items.map((entry) => entry.id));
}

/**
 * Transactions of one month, long enough to weigh something. Returns their ids.
 *
 * @param {string} month YYYY-MM
 * @param {number} [count]
 * @returns {Promise<string[]>}
 */
async function addMonth(month, count = 3) {
  const made = [];
  for (let index = 0; index < count; index += 1) {
    const transaction = await store.createTransaction({
      date: month + '-' + String(10 + index),
      amount: -1500 * (index + 1),
      accountId: 'account_seed_current',
      description: 'Budget test purchase ' + month + ' number ' + index + ' ' + 'padding words '.repeat(12),
    });
    made.push(transaction.id);
  }
  return made;
}

/** Feb to Aug 2026, beside the seed's January: eight months holding transactions. */
const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
const SEED_JANUARY = ['transaction_seed_1', 'transaction_seed_2', 'transaction_seed_3', 'transaction_seed_4', 'transaction_seed_5'];

/** @returns {Promise<Record<string, string[]>>} transaction ids by month */
async function addYear() {
  /** @type {Record<string, string[]>} */
  const byMonth = { '2026-01': SEED_JANUARY };
  for (const month of MONTHS.slice(1)) byMonth[month] = await addMonth(month);
  return byMonth;
}

/** The whole context, unsummarised: the budget is lifted. */
async function wholeContext() {
  budget.maxChars = Number.MAX_SAFE_INTEGER;
  return contextModule.buildContext('question');
}

/**
 * What the block measures when the given months' transactions are gone: the
 * one measure (`serializeContext`) applied to what summarising would leave.
 *
 * @param {Awaited<ReturnType<typeof wholeContext>>} whole
 * @param {Record<string, string[]>} byMonth
 * @param {string[]} gone months whose transactions are summarised
 * @param {string | { since?: string, before: string }} before the oldest month in full, or the whole `summarised`
 */
function lengthWithout(whole, byMonth, gone, before) {
  const dropped = new Set(gone.flatMap((month) => byMonth[month]));
  return contextModule.serializeContext({
    ...whole,
    summarised: gone.length === 0 ? null : typeof before === 'string' ? { before } : before,
    items: whole.items.filter((entry) => !dropped.has(entry.id)),
  }).length;
}

describe('POST /api/questions over the size budget: under it', () => {
  it('summarises nothing, and says so: every transaction is sent and summarised is null', async () => {
    const byMonth = await addYear();
    const whole = await wholeContext();
    budget.maxChars = contextModule.serializeContext(whole).length; // exactly fits
    modelAnswers([], { notInData: true });

    const response = await ask();
    const { context } = sentRequest();

    expect(await response.json()).toEqual({ ok: true, outcome: 'not-in-data', summarised: null });
    expect(context.summarised).toBeNull();
    for (const transactionId of Object.values(byMonth).flat()) expect(ids(context).has(transactionId)).toBe(true);
  });

  it('measures what is sent: the length compared with the budget is the length of the block', async () => {
    await addYear();
    const whole = await wholeContext();
    const measured = contextModule.serializeContext(whole);
    modelAnswers([], { notInData: true });
    await ask();

    expect(sentRequest().json).toBe(measured);
    expect(measured.length).toBe(sentRequest().json.length);
  });

  it('measures the escaped text and nothing the model is not shown', async () => {
    await store.createMemoryEntry({ content: '<<<<<<<<<< angle brackets' });
    const whole = await wholeContext();
    const measured = contextModule.serializeContext(whole);

    expect(measured).not.toContain('<');
    expect(measured).toContain('\\u003c\\u003c');
    expect(measured).not.toContain('opens');
    expect(JSON.parse(measured).tooLarge).toBeUndefined();
  });

  it('one more character over the line summarises the oldest month, one fewer under does not', async () => {
    const byMonth = await addYear();
    const whole = await wholeContext();
    const full = contextModule.serializeContext(whole).length;

    budget.maxChars = full;
    modelAnswers([], { notInData: true });
    await ask();
    expect(sentRequest().context.summarised).toBeNull();

    mockCreate.mockReset();
    budget.maxChars = full - 1;
    modelAnswers([], { notInData: true });
    await ask();
    expect(sentRequest().context.summarised).toEqual({ before: '2026-02' });
    expect(ids(sentRequest().context).has(byMonth['2026-01'][0])).toBe(false);
  });
});

describe('POST /api/questions over the size budget: summarised', () => {
  it('replaces the oldest months of transactions by their monthly figures, and keeps the newest three whole', async () => {
    const byMonth = await addYear();
    const whole = await wholeContext();
    // Fits only once January to May are summarised: the five oldest.
    budget.maxChars = lengthWithout(whole, byMonth, MONTHS.slice(0, 5), '2026-06');
    modelAnswers([], { notInData: true });

    const response = await ask();
    const { context } = sentRequest();

    expect(await response.json()).toEqual({ ok: true, outcome: 'not-in-data', summarised: { before: '2026-06' } });
    expect(context.summarised).toEqual({ before: '2026-06' });
    for (const month of MONTHS.slice(0, 5)) {
      for (const transactionId of byMonth[month]) expect(ids(context).has(transactionId)).toBe(false);
      // Their monthly figures stand in for them.
      for (const figure of ['income', 'spending', 'left', 'fixed', 'variable']) {
        expect(ids(context).has('figure:' + figure + ':' + month)).toBe(true);
      }
    }
    for (const month of MONTHS.slice(5)) {
      for (const transactionId of byMonth[month]) expect(ids(context).has(transactionId)).toBe(true);
    }
  });

  it('goes oldest first and stops as soon as it fits, month by month', async () => {
    const byMonth = await addYear();
    const whole = await wholeContext();

    for (let gone = 1; gone <= 5; gone += 1) {
      const summarised = MONTHS.slice(0, gone);
      const before = MONTHS[gone];
      // One character short of fitting, it takes the next month too -- until
      // the next month is one of the newest three, which is never touched.
      for (const [delta, fewer] of [[0, gone], ...(gone < 5 ? [[-1, gone + 1]] : [])]) {
        mockCreate.mockReset();
        budget.maxChars = lengthWithout(whole, byMonth, summarised, before) + delta;
        modelAnswers([], { notInData: true });

        await ask();

        const { context } = sentRequest();
        const expected = MONTHS.slice(0, fewer);
        for (const month of MONTHS) {
          for (const transactionId of byMonth[month]) {
            expect(ids(context).has(transactionId), month + ' with ' + expected.length + ' summarised').toBe(
              !expected.includes(month)
            );
          }
        }
        expect(context.summarised).toEqual({ before: MONTHS[expected.length] });
      }
    }
  });

  it('is too large, not cut further, when the last month that may go is not enough', async () => {
    const byMonth = await addYear();
    const whole = await wholeContext();
    budget.maxChars = lengthWithout(whole, byMonth, MONTHS.slice(0, 5), '2026-06') - 1;

    const response = await ask();

    expect(await response.json()).toEqual({ ok: true, outcome: 'too-large' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('keeps every figure: only transactions are replaced, nothing else is cut', async () => {
    await addYear();
    const whole = await wholeContext();
    budget.maxChars = contextModule.serializeContext(whole).length - 1;
    modelAnswers([], { notInData: true });

    await ask();
    const { context } = sentRequest();

    const kept = ids(context);
    for (const entry of whole.items) {
      if (entry.type !== 'transaction') expect(kept.has(entry.id), entry.id).toBe(true);
    }
  });

  it('tells the model what was summarised: the block carries it, and the prompt says how to read it', async () => {
    await addYear();
    const whole = await wholeContext();
    budget.maxChars = contextModule.serializeContext(whole).length - 1;
    modelAnswers([], { notInData: true });

    await ask();
    const { request, context } = sentRequest();

    expect(context.summarised).toEqual({ before: '2026-02' });
    expect(request.system).toContain('"summarised"');
    expect(request.system).toContain('are NOT among the items: they were read only as monthly totals, so answer from the figures');
    expect(request.system).toContain('"since"');
    expect(request.system).toContain('Never say there were none or that nothing happened in those months');
  });

  it('carries summarised on an answer, so the panel can say it', async () => {
    await addYear();
    const whole = await wholeContext();
    budget.maxChars = contextModule.serializeContext(whole).length - 1;
    modelAnswers([{ text: 'You spent 1012.50 EUR in January.', citations: ['figure:spending:2026-01'] }]);

    const response = await ask('How much did I spend in January?');

    expect(await response.json()).toMatchObject({
      ok: true,
      outcome: 'answer',
      leftOut: false,
      summarised: { before: '2026-02' },
    });
  });

  it('drops a citation of a transaction that was summarised away, like any id not sent', async () => {
    await addYear();
    const whole = await wholeContext();
    budget.maxChars = contextModule.serializeContext(whole).length - 1;
    modelAnswers([
      { text: 'A coffee in January.', citations: ['transaction_seed_4'] },
      { text: 'January spending.', citations: ['figure:spending:2026-01'] },
    ]);

    const body = await (await ask()).json();

    expect(body.statements.map((/** @type {{ text: string }} */ statement) => statement.text)).toEqual([
      'January spending.',
    ]);
    expect(body.leftOut).toBe(true);
    expect(body.summarised).toEqual({ before: '2026-02' });
  });

  it('never summarises the newest months the setting keeps whole', async () => {
    const byMonth = await addYear();
    budget.recentMonths = 6;
    budget.maxChars = 1; // nothing can fit: summarise all it may, then refuse

    const refused = await contextModule.buildContext('question');
    const response = await ask();

    // March to August are the newest six: only January and February could go.
    expect(refused.tooLarge).toBe(true);
    expect(refused.summarised).toEqual({ before: '2026-03' });
    const kept = new Set(refused.items.map((entry) => entry.id));
    for (const month of MONTHS.slice(2)) {
      for (const transactionId of byMonth[month]) expect(kept.has(transactionId), month).toBe(true);
    }
    for (const month of MONTHS.slice(0, 2)) {
      for (const transactionId of byMonth[month]) expect(kept.has(transactionId), month).toBe(false);
    }
    expect(await response.json()).toEqual({ ok: true, outcome: 'too-large' });
  });
});

describe('POST /api/questions over the size budget: months with no figure', () => {
  it('never drops the transactions of a month before "tracked since", whatever the budget', async () => {
    const byMonth = await addYear();
    await store.updateProfile({ financeTrackedSince: '2026-03-01' });
    const whole = await wholeContext();
    // January and February have no monthly figure: nothing would stand in for them.
    expect(ids(/** @type {any} */ (whole)).has('figure:spending:2026-02')).toBe(false);
    // Fits only once March to May (the figured months outside the newest three) are gone.
    budget.maxChars = lengthWithout(whole, byMonth, ['2026-03', '2026-04', '2026-05'], { since: '2026-03', before: '2026-06' });
    modelAnswers([], { notInData: true });

    const response = await ask();
    const { context } = sentRequest();

    // January and February are older than the summarised months and stay whole,
    // so "before June" would be false: the range says where it starts.
    expect((await response.json()).summarised).toEqual({ since: '2026-03', before: '2026-06' });
    expect(context.summarised).toEqual({ since: '2026-03', before: '2026-06' });
    for (const month of ['2026-01', '2026-02', '2026-06', '2026-07', '2026-08']) {
      for (const transactionId of byMonth[month]) expect(ids(context).has(transactionId), month).toBe(true);
    }
    for (const month of ['2026-03', '2026-04', '2026-05']) {
      for (const transactionId of byMonth[month]) expect(ids(context).has(transactionId), month).toBe(false);
    }
  });

  it('is too large when only the months with no figure are what stands in the way', async () => {
    const byMonth = await addYear();
    await store.updateProfile({ financeTrackedSince: '2026-03-01' });
    const whole = await wholeContext();
    const allSummarisable = lengthWithout(whole, byMonth, ['2026-03', '2026-04', '2026-05'], { since: '2026-03', before: '2026-06' });
    budget.maxChars = allSummarisable - 1;
    await store.getTasks();
    const before = await workingFile();

    const response = await ask();

    expect(await response.json()).toEqual({ ok: true, outcome: 'too-large' });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(await workingFile()).toBe(before);
  });
});

describe('POST /api/questions over the size budget: a month after today', () => {
  it('does not take one of the protected recent months: only months up to today count as recent', async () => {
    const byMonth = await addYear();
    await addMonth('2026-12'); // a mistyped year or a planned spend: after today, never summarised
    budget.maxChars = 1; // nothing can fit: summarise all it may, then refuse

    const refused = await contextModule.buildContext('question');

    // Today is September 2026: June to August are the newest three that count.
    expect(refused.summarised).toEqual({ before: '2026-06' });
    const kept = new Set(refused.items.map((entry) => entry.id));
    for (const month of MONTHS.slice(5)) {
      for (const transactionId of byMonth[month]) expect(kept.has(transactionId), month).toBe(true);
    }
    for (const transactionId of byMonth['2026-05']) expect(kept.has(transactionId), '2026-05').toBe(false);
  });
});

describe('POST /api/questions over the size budget: still too large', () => {
  it('refuses with too-large, never calls the model, and writes nothing', async () => {
    await addYear();
    await store.getTasks();
    const before = await workingFile();
    budget.maxChars = 1000;

    const response = await ask();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, outcome: 'too-large' });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(await workingFile()).toBe(before);
  });

  it('is too large without a single transaction too, and cuts nothing else', async () => {
    budget.maxChars = 1000;
    const context = await contextModule.buildContext('question');
    const full = await wholeContext();

    expect(context.tooLarge).toBe(true);
    // Everything but summarisable transactions is still there: no trimming of anything else.
    const kept = new Set(context.items.map((entry) => entry.id));
    for (const entry of full.items) {
      if (entry.type !== 'transaction') expect(kept.has(entry.id), entry.id).toBe(true);
    }
  });

  it('says nothing is summarised and nothing is too large when under the budget', async () => {
    const context = await wholeContext();

    expect(context.summarised).toBeNull();
    expect(context.tooLarge).toBe(false);
  });
});
