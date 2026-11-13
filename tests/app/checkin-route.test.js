/**
 * GET and POST /api/checkin (ADR 0037): today's questions, computed from the
 * store, and closed answers filed through the action registry by rules.
 * Run against the seed in a throwaway DATA_DIR with the clock pinned, no
 * model key, and the model's modules replaced by ones that refuse to load:
 * neither route may reach a model (rule 3).
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai/provider.js', () => {
  throw new Error('the check-in loaded the model provider');
});
vi.mock('@/lib/classify.js', () => {
  throw new Error('the check-in loaded the classifier');
});

/** Thursday 24 September 2026, noon in Rome: a day the seed has no log for. */
const NOON = new Date('2026-09-24T10:00:00Z');
const DAY = '2026-09-24';
const YESTERDAY = '2026-09-23';
const TOMORROW = '2026-09-25';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/checkin/route.js')} */
let route;
/** @type {typeof import('@/app/api/actions/[id]/undo/route.js')} */
let undoRoute;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-checkin-route-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  delete process.env.ANTHROPIC_API_KEY;
  route = await import('@/app/api/checkin/route.js');
  undoRoute = await import('@/app/api/actions/[id]/undo/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * @param {string} [query]
 * @param {Record<string, string>} [headers]
 */
async function get(query = '', headers = {}) {
  const response = await route.GET(new Request('http://localhost/api/checkin' + query, { headers }));
  return { status: response.status, body: await response.json() };
}

/**
 * @param {unknown} body
 * @param {Record<string, string>} [headers]
 */
async function post(body, headers = {}) {
  const response = await route.POST(
    new Request('http://localhost/api/checkin', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
  return { status: response.status, body: await response.json() };
}

/** @param {string} id */
function undo(id) {
  return undoRoute.POST(new Request('http://localhost/api/actions/' + id + '/undo', { method: 'POST' }), {
    params: Promise.resolve({ id }),
  });
}

/**
 * @param {{ questions: { id: string, answered: boolean }[] }} body
 * @param {string} id
 */
const answered = (body, id) => body.questions.find((question) => question.id === id)?.answered;

describe('GET /api/checkin', () => {
  it("asks a fresh day's questions, none answered, with an empty receipt", async () => {
    const { status, body } = await get();

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.day).toBe(DAY);
    expect(body.questions.map((/** @type {{ id: string }} */ question) => question.id)).toEqual([
      'habit:habit_move',
      'habit:habit_read',
      'habit:habit_water',
      'habit:habit_deep_work',
      'mood',
      'energy',
      'time',
      'open',
    ]);
    expect(body.questions.every((/** @type {{ answered: boolean }} */ question) => !question.answered)).toBe(true);
    expect(body.done).toBe(false);
    expect(body.receipt).toEqual({ lines: [] });
  });

  it('asks a past day named in the address', async () => {
    const { status, body } = await get('?day=' + YESTERDAY);
    expect(status).toBe(200);
    expect(body.day).toBe(YESTERDAY);
  });

  it('refuses a future day, and a day that is not one', async () => {
    expect((await get('?day=' + TOMORROW)).status).toBe(400);
    expect((await get('?day=yesterday')).status).toBe(400);
  });

  it('refuses a request forwarded from off the Mac without the phone token', async () => {
    expect((await get('', { 'x-forwarded-for': '100.64.0.7' })).status).toBe(401);
  });
});

describe('POST /api/checkin', () => {
  it('files a habit done, a mood and time, then GET shows them answered and the receipt lines', async () => {
    const { status, body } = await post({
      answers: [
        { questionId: 'habit:habit_water', value: { done: true } },
        { questionId: 'mood', value: { value: 4 } },
        { questionId: 'time', value: { areas: { work: 120, study: 30 } } },
      ],
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.day).toBe(DAY);
    expect(body.receipt.lines.map((/** @type {{ name: string }} */ line) => line.name)).toEqual(['habit.set', 'mood.set', 'time.set', 'time.set']);
    expect(body.receipt.lines.every((/** @type {{ status: string }} */ line) => line.status === 'done')).toBe(true);
    expect(body.receipt.lines.map((/** @type {{ text: string }} */ line) => line.text)).toEqual([
      'Glasses of water 8',
      'Mood 4',
      'Work 2h',
      'Study 30m',
    ]);
    expect(answered(body, 'habit:habit_water')).toBe(true);
    expect(answered(body, 'mood')).toBe(true);
    expect(answered(body, 'time')).toBe(true);
    expect(answered(body, 'energy')).toBe(false);

    const log = await store.getDailyLog(DAY);
    expect(log.habits.habit_water).toBe(8);
    expect(log.mood).toBe(4);
    expect(log.time).toEqual({ work: 120, study: 30 });

    const after = await get();
    expect(answered(after.body, 'habit:habit_water')).toBe(true);
    expect(answered(after.body, 'mood')).toBe(true);
    expect(after.body.receipt.lines.map((/** @type {{ actionId: string }} */ line) => line.actionId)).toEqual(
      body.receipt.lines.map((/** @type {{ actionId: string }} */ line) => line.actionId)
    );
  });

  it("keeps this request's lines apart from the whole day's", async () => {
    await post({ answers: [{ questionId: 'mood', value: { value: 3 } }] });

    const { body } = await post({ answers: [{ questionId: 'energy', value: { value: 2 } }] });

    expect(body.receipt.lines.map((/** @type {{ name: string }} */ line) => line.name)).toEqual(['energy.set']);
    expect(body.dayReceipt.lines.map((/** @type {{ name: string }} */ line) => line.name)).toEqual(['mood.set', 'energy.set']);
  });

  it('opens the question again when its line is undone', async () => {
    const { body } = await post({ answers: [{ questionId: 'mood', value: { value: 4 } }] });
    const [line] = body.receipt.lines;
    expect(line.undoable).toBe(true);

    expect((await undo(line.actionId)).status).toBe(200);

    const after = await get();
    expect(answered(after.body, 'mood')).toBe(false);
    expect(after.body.receipt.lines).toMatchObject([{ actionId: line.actionId, status: 'undone', undoable: false }]);
  });

  it('answers a habit with a skip reason, and the open question as a journal entry word for word', async () => {
    const text = 'A quiet day; the train was late.';
    const { body } = await post({
      answers: [
        { questionId: 'habit:habit_read', value: { skip: 'too-heavy' } },
        { questionId: 'open', value: { text } },
      ],
    });

    expect(body.receipt.lines.map((/** @type {{ name: string, status: string }} */ line) => [line.name, line.status])).toEqual([
      ['habit.skip', 'done'],
      ['journal.add', 'done'],
    ]);
    expect(answered(body, 'habit:habit_read')).toBe(true);
    expect(answered(body, 'open')).toBe(false);
    expect((await store.getJournalEntries(DAY, DAY)).map((entry) => entry.text)).toEqual([text]);
  });

  it('files an answer to a past day named in the body under that day', async () => {
    const { body } = await post({ day: YESTERDAY, answers: [{ questionId: 'mood', value: { value: 2 } }] });

    expect(body.day).toBe(YESTERDAY);
    expect((await store.getDailyLog(YESTERDAY)).mood).toBe(2);
    expect((await store.getDailyLog(DAY)).mood).toBeNull();
  });

  it('rejects an answer to a question not asked as a line, and still files the rest', async () => {
    const { status, body } = await post({
      answers: [
        { questionId: 'habit:habit_nope', value: { done: true } },
        { questionId: 'mood', value: { value: 5 } },
      ],
    });

    expect(status).toBe(200);
    expect(body.receipt.lines).toHaveLength(2);
    expect(body.receipt.lines[0]).toMatchObject({ actionId: null, status: 'rejected', undoable: false });
    expect(body.receipt.lines[0].error).toMatch(/habit:habit_nope/);
    expect(body.receipt.lines[1]).toMatchObject({ name: 'mood.set', status: 'done' });
    expect(body.dayReceipt.lines).toHaveLength(1);
  });

  it('rejects a value that does not fit its question, and one its action refuses, as lines', async () => {
    const { body } = await post({
      answers: [
        { questionId: 'mood', value: { done: true } },
        { questionId: 'energy', value: { value: 9 } },
      ],
    });

    expect(body.receipt.lines.map((/** @type {{ status: string }} */ line) => line.status)).toEqual(['rejected', 'rejected']);
    expect((await store.getDailyLog(DAY)).energy).toBeNull();
  });

  it('refuses a future day, writing nothing', async () => {
    const { status } = await post({ day: TOMORROW, answers: [{ questionId: 'mood', value: { value: 3 } }] });

    expect(status).toBe(400);
    expect((await store.getActionRecords()).length).toBe(0);
  });

  it.each([
    ['not JSON', '{'],
    ['not an object', [1]],
    ['no answers', {}],
    ['an empty list', { answers: [] }],
    ['an answer with no question id', { answers: [{ value: { value: 3 } }] }],
    ['an answer with no value', { answers: [{ questionId: 'mood' }] }],
    ['a field it does not take', { answers: [{ questionId: 'mood', value: { value: 3 } }], mood: 3 }],
    ['an answer with a field it does not take', { answers: [{ questionId: 'mood', value: { value: 3 }, note: 'x' }] }],
    ['a day that is not one', { day: 'today', answers: [{ questionId: 'mood', value: { value: 3 } }] }],
  ])('answers 400 to a body with %s, writing nothing', async (_name, body) => {
    const { status, body: answer } = await post(body);

    expect(status).toBe(400);
    expect(answer.status).toBe('error');
    expect((await store.getActionRecords()).length).toBe(0);
  });

  it('refuses a request forwarded from off the Mac without the phone token, writing nothing', async () => {
    const { status } = await post({ answers: [{ questionId: 'mood', value: { value: 3 } }] }, { 'x-forwarded-for': '100.64.0.7' });

    expect(status).toBe(401);
    expect((await store.getDailyLog(DAY)).mood).toBeNull();
  });
});
