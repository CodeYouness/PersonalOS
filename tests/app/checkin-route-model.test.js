/**
 * POST /api/checkin with a model key (ADR 0037): the open answer is kept as
 * a journal entry, then read by the small model for the records it names,
 * all on one receipt. GET and the closed answers still call nothing (rule
 * 3), and a model that fails leaves the entry alone, with a 200 (rule 2).
 * The model is stubbed at the provider seam; the key is set before anything
 * is imported, since the environment is read once, at import. Kept apart
 * from checkin-route.test.js, which runs with no key.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ai/provider.js', () => ({ callTool }));

/** Thursday 24 September 2026, noon in Rome. */
const NOON = new Date('2026-09-24T10:00:00Z');
const DAY = '2026-09-24';

const SENTENCE = 'Went for my walk and spent 12,50 on lunch';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/checkin/route.js')} */
let route;
/** @type {typeof import('@/app/api/actions/[id]/undo/route.js')} */
let undoRoute;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-checkin-route-model-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ANTHROPIC_MODEL_CHECKIN = 'claude-test-checkin';
  route = await import('@/app/api/checkin/route.js');
  undoRoute = await import('@/app/api/actions/[id]/undo/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL_CHECKIN;
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  await store.updateProfile({ defaultAccountId: 'account_seed_current' });
  callTool.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** @param {unknown} body */
async function post(body) {
  const response = await route.POST(
    new Request('http://localhost/api/checkin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
  return { status: response.status, body: await response.json() };
}

/** @param {{ lines: { name: string, status: string }[] }} receipt */
const namesOf = (receipt) => receipt.lines.map((line) => [line.name, line.status]);

describe('POST /api/checkin, the open answer with a model', () => {
  it('files the entry and the records drawn from it, on this request\'s receipt and the day\'s', async () => {
    callTool.mockResolvedValueOnce({
      input: {
        actions: [
          { action: 'habit.set', params: { habitId: 'habit_move', value: true } },
          { action: 'expense.record', params: { amount: 1250, categoryId: 'cat_eating_out', note: 'lunch' } },
        ],
      },
      stopReason: 'tool_use',
      usage: null,
    });

    const { status, body } = await post({ answers: [{ questionId: 'open', value: { text: SENTENCE } }] });

    expect(status).toBe(200);
    const expected = [
      ['journal.add', 'done'],
      ['habit.set', 'done'],
      ['expense.record', 'done'],
    ];
    expect(namesOf(body.receipt)).toEqual(expected);
    expect(namesOf(body.dayReceipt)).toEqual(expected);
    expect(body.dayReceipt.lines.map((/** @type {{ text: string }} */ line) => line.text)).toEqual([
      'Journal entry added',
      'Move for 30 minutes ticked',
      'Spent 12.50 on Eating out — lunch',
    ]);
    // The habit the sentence ticked is answered now.
    expect(body.questions.find((/** @type {{ id: string }} */ question) => question.id === 'habit:habit_move').answered).toBe(true);
    expect(callTool).toHaveBeenCalledTimes(1);

    // One undo, on the entry's line, takes the whole answer back.
    const entryLine = body.receipt.lines[0];
    const undone = await undoRoute.POST(
      new Request('http://localhost/api/actions/' + entryLine.actionId + '/undo', { method: 'POST' }),
      { params: Promise.resolve({ id: entryLine.actionId }) }
    );
    expect(undone.status).toBe(200);
    const after = await route.GET(new Request('http://localhost/api/checkin'));
    expect(namesOf((await after.json()).receipt)).toEqual([
      ['journal.add', 'undone'],
      ['habit.set', 'undone'],
      ['expense.record', 'undone'],
    ]);
  });

  it('answers 200 with the entry alone when the model fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    callTool.mockRejectedValueOnce(new Error('overloaded'));

    const { status, body } = await post({ answers: [{ questionId: 'open', value: { text: SENTENCE } }] });

    expect(status).toBe(200);
    expect(namesOf(body.receipt)).toEqual([['journal.add', 'done']]);
    expect((await store.getJournalEntries(DAY, DAY)).map((entry) => entry.text)).toEqual([SENTENCE]);
  });

  it('calls no model to load the check-in, or to file a closed answer', async () => {
    const read = await route.GET(new Request('http://localhost/api/checkin'));
    expect(read.status).toBe(200);
    const { status } = await post({
      answers: [
        { questionId: 'habit:habit_read', value: { done: true } },
        { questionId: 'mood', value: { value: 4 } },
      ],
    });
    expect(status).toBe(200);
    expect(callTool).not.toHaveBeenCalled();
  });
});
