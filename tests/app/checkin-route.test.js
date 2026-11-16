/**
 * GET and POST /api/checkin (ADR 0037): today's questions, computed from the
 * store, and closed answers filed through the action registry by rules.
 * Run against the seed in a throwaway DATA_DIR with the clock pinned and no
 * model key. The route loads the open answer's reader, so the provider is
 * replaced by one that fails any call, and every test checks none was made:
 * without a key not even the open answer reaches a model (rule 3), and it
 * is filed as its journal entry alone (rule 2). The classifier refuses to
 * load at all. checkin-route-model.test.js has the key.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('the check-in called the model');
  })
);

vi.mock('@/lib/ai/provider.js', () => ({ callTool }));
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
  expect(callTool).not.toHaveBeenCalled();
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

  it('answers the week strip: the seven days ending today, each filled, partly filled or not', async () => {
    const { body } = await get();

    expect(body.week.map((/** @type {{ day: string }} */ day) => day.day)).toEqual([
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
    ]);
    expect(body.week.at(-1)).toMatchObject({ day: DAY, fill: 'empty', answered: 0, total: 7 });
    expect(body.week.every((/** @type {{ fill: string }} */ day) => ['filled', 'partly', 'empty'].includes(day.fill))).toBe(true);
  });

  it('ends the week on today in the user\'s timezone, not the server clock\'s day', async () => {
    // 22:30 on the 23rd in UTC is half past midnight on the 24th in Rome.
    vi.setSystemTime(new Date('2026-09-23T22:30:00Z'));

    const { body } = await get();

    expect(body.day).toBe(DAY);
    expect(body.week.at(-1).day).toBe(DAY);
    expect(body.week[0].day).toBe('2026-09-18');
  });

  it('ends the week on today whatever past day is asked', async () => {
    const { body } = await get('?day=' + YESTERDAY);
    expect(body.day).toBe(YESTERDAY);
    expect(body.week.at(-1).day).toBe(DAY);
  });

  it('answers what the day was answered with, and no notes on a fresh day', async () => {
    const { body } = await get();
    expect(body.answers).toEqual({ mood: null, energy: null, time: null, habits: {}, skips: {} });
    expect(body.notes).toEqual([]);
  });

  it('writes nothing to read the day and its week', async () => {
    const before = await store.getDailyLogs('2026-09-18', DAY);
    await get();
    await get('?day=' + YESTERDAY);
    expect(await store.getDailyLogs('2026-09-18', DAY)).toEqual(before);
    expect((await store.getActionRecords()).length).toBe(0);
  });
});

describe('the day a screen shows', () => {
  it('is the day asked when it is one of the strip\'s seven, else today', async () => {
    const { weekDayOrToday } = await import('@/lib/checkin/day.js');
    expect(weekDayOrToday(YESTERDAY, DAY)).toBe(YESTERDAY);
    expect(weekDayOrToday('2026-09-18', DAY)).toBe('2026-09-18');
    // Older than the strip, in the future, not a day, or not given.
    expect(weekDayOrToday('2026-09-17', DAY)).toBe(DAY);
    expect(weekDayOrToday(TOMORROW, DAY)).toBe(DAY);
    expect(weekDayOrToday('2026-02-30', DAY)).toBe(DAY);
    expect(weekDayOrToday(undefined, DAY)).toBe(DAY);
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
    // The week it answers with has yesterday partly filled now.
    expect(body.week.find((/** @type {{ day: string }} */ day) => day.day === YESTERDAY)).toMatchObject({ fill: 'partly', answered: 1 });
    expect(body.answers.mood).toBe(2);
  });

  it('answers the week and the day\'s answers after each answer, filled once every question is', async () => {
    const { body } = await post({
      answers: [
        { questionId: 'habit:habit_move', value: { done: true } },
        { questionId: 'habit:habit_read', value: { skip: 'paused' } },
        { questionId: 'habit:habit_water', value: { value: 3 } },
        { questionId: 'habit:habit_deep_work', value: { done: true } },
        { questionId: 'mood', value: { value: 4 } },
        { questionId: 'energy', value: { value: 3 } },
        { questionId: 'time', value: { none: true } },
      ],
    });

    // Water at 3 of 8 is not answered: the day is partly filled.
    expect(body.done).toBe(false);
    expect(body.week.at(-1)).toMatchObject({ day: DAY, fill: 'partly', answered: 6, total: 7 });
    expect(body.answers).toMatchObject({ mood: 4, energy: 3, time: {}, habits: { habit_move: true, habit_water: 3 }, skips: { habit_read: 'paused' } });

    const filled = await post({ answers: [{ questionId: 'habit:habit_water', value: { done: true } }] });
    expect(filled.body.done).toBe(true);
    expect(filled.body.week.at(-1)).toMatchObject({ fill: 'filled', answered: 7 });
  });

  it('changes an answer by answering again: a mood, a time area, and a habit ticked then given a reason', async () => {
    await post({
      answers: [
        { questionId: 'habit:habit_move', value: { done: true } },
        { questionId: 'mood', value: { value: 4 } },
        { questionId: 'time', value: { areas: { work: 240, study: 60 } } },
      ],
    });

    const { body } = await post({
      answers: [
        { questionId: 'habit:habit_move', value: { skip: 'too-heavy' } },
        { questionId: 'mood', value: { value: 2 } },
        { questionId: 'time', value: { areas: { work: 180, study: 0 } } },
      ],
    });

    expect(body.receipt.lines.map((/** @type {{ text: string, status: string }} */ line) => [line.text, line.status])).toEqual([
      ['Move for 30 minutes unticked', 'done'],
      ['Move for 30 minutes: Too heavy', 'done'],
      ['Mood 2', 'done'],
      ['Work 3h', 'done'],
      ['Study 0m', 'done'],
    ]);
    expect(body.answers).toMatchObject({ mood: 2, time: { work: 180 }, habits: { habit_move: false }, skips: { habit_move: 'too-heavy' } });
    expect(answered(body, 'habit:habit_move')).toBe(true);

    // And back: a habit given a reason, ticked, loses the reason.
    const back = await post({ answers: [{ questionId: 'habit:habit_move', value: { done: true } }] });
    expect(back.body.answers.habits.habit_move).toBe(true);
    expect(back.body.answers.skips).toEqual({});
  });

  it('lists each note kept, as written, and leaves out one taken back', async () => {
    const first = await post({ answers: [{ questionId: 'open', value: { text: 'A quiet day.' } }] });
    const { body } = await post({ answers: [{ questionId: 'open', value: { text: 'The train was late.' } }] });

    expect(body.notes.map((/** @type {{ text: string, undoable: boolean, filed: unknown[] }} */ note) => [note.text, note.undoable, note.filed])).toEqual([
      ['A quiet day.', true, []],
      ['The train was late.', true, []],
    ]);
    expect(body.notes[0].actionId).toBe(first.body.receipt.lines[0].actionId);

    expect((await undo(body.notes[0].actionId)).status).toBe(200);
    expect((await get()).body.notes.map((/** @type {{ text: string }} */ note) => note.text)).toEqual(['The train was late.']);
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
