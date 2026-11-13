/**
 * The check-in's open answer read by the small model (ADR 0037's second
 * tier): the journal entry is kept first, then the model's list of actions
 * is filed through the registry under the entry, on the same receipt, each
 * record linked back to the entry, and undone with it. The model is stubbed
 * at the provider seam; a key is set before anything is imported, since the
 * environment is read once, at import. Run against the seed in a throwaway
 * DATA_DIR with the clock pinned.
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

const SENTENCE = 'Ho fatto la camminata e speso 18 euro di pranzo';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/checkin/day.js')} */
let checkin;
/** @type {typeof import('@/lib/checkin/interpret.js')} */
let interpret;
/** @type {typeof import('@/lib/actions/registry.js')} */
let registry;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/personalos.config.js')} */
let config;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-checkin-open-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ANTHROPIC_MODEL_CHECKIN = 'claude-test-checkin';
  checkin = await import('@/lib/checkin/day.js');
  interpret = await import('@/lib/checkin/interpret.js');
  registry = await import('@/lib/actions/registry.js');
  store = await import('@/lib/store.js');
  config = await import('@/personalos.config.js');
});

afterAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL_CHECKIN;
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  // The seed names no default account; an expense said in passing needs one.
  await store.updateProfile({ defaultAccountId: 'account_seed_current' });
  callTool.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * The model answers with these actions.
 *
 * @param {unknown} actions
 * @param {string} [stopReason]
 */
function modelFiles(actions, stopReason = 'tool_use') {
  callTool.mockResolvedValueOnce({ input: { actions }, stopReason, usage: { inputTokens: 900, outputTokens: 80 } });
}

/** @param {string} [text] */
function answerOpen(text = SENTENCE) {
  return checkin.answerCheckin(DAY, [{ questionId: 'open', value: { text } }], { readOpenAnswer: interpret.readOpenAnswer });
}

/** The day's journal entries' texts. */
async function journalTexts() {
  return (await store.getJournalEntries(DAY, DAY)).map((entry) => entry.text);
}

/**
 * @param {import('@/lib/actions/registry.js').ReceiptLine} line
 * @returns {Promise<import('@/lib/domain/types.js').ActionRecord>}
 */
async function recordOf(line) {
  const record = await store.getActionRecord(/** @type {string} */ (line.actionId));
  if (record === null) throw new Error('no record for ' + line.name);
  return record;
}

const GYM_AND_LUNCH = [
  { action: 'habit.set', params: { habitId: 'habit_move', value: true } },
  { action: 'expense.record', params: { amount: 1800, categoryId: 'cat_eating_out', note: 'pranzo' } },
];

describe('the open answer, read by the model', () => {
  it('keeps the entry first, then files the habit and the expense it names on the same receipt', async () => {
    callTool.mockImplementationOnce(async () => {
      // The sentence is already saved when the model is asked.
      expect(await journalTexts()).toContain(SENTENCE);
      return { input: { actions: GYM_AND_LUNCH }, stopReason: 'tool_use', usage: null };
    });

    const { lines } = await answerOpen();

    expect(lines.map((line) => [line.name, line.status])).toEqual([
      ['journal.add', 'done'],
      ['habit.set', 'done'],
      ['expense.record', 'done'],
    ]);
    expect(lines.map((line) => line.text)).toEqual([
      'Journal entry added',
      'Move for 30 minutes ticked',
      'Spent 18.00 on Eating out — pranzo',
    ]);
    expect(await journalTexts()).toEqual([SENTENCE]);
    expect((await store.getDailyLog(DAY)).habits.habit_move).toBe(true);

    const expense = await recordOf(lines[2]);
    expect(await store.getTransaction(/** @type {string} */ (expense.recordRef))).toMatchObject({
      date: DAY,
      amount: -1800,
      accountId: 'account_seed_current',
      categoryId: 'cat_eating_out',
      source: 'checkin',
    });

    // The day's receipt, as a refresh rebuilds it, holds all three.
    expect((await checkin.checkinReceipt(DAY)).lines.map((line) => [line.name, line.status, line.undoable])).toEqual([
      ['journal.add', 'done', true],
      ['habit.set', 'done', true],
      ['expense.record', 'done', true],
    ]);
  });

  it('makes each action for the entry, and links each record it wrote back to the entry (rule 7)', async () => {
    modelFiles([...GYM_AND_LUNCH, { action: 'task.create', params: { title: 'Prenotare il dentista' } }]);

    const { lines } = await answerOpen();

    const entryId = /** @type {string} */ ((await recordOf(lines[0])).recordRef);
    const drawn = await Promise.all(lines.slice(1).map(recordOf));
    expect(drawn.map((record) => record.origin)).toEqual(drawn.map(() => ({ type: 'checkin', id: entryId })));
    expect(drawn.map((record) => record.source)).toEqual(['checkin', 'checkin', 'checkin']);

    // A habit's value is a field of the day's log: no record to link.
    const [, expense, task] = drawn;
    expect(await store.getRelated(/** @type {string} */ (expense.recordRef), 'derived_from')).toEqual([entryId]);
    expect(await store.getRelated(/** @type {string} */ (task.recordRef), 'derived_from')).toEqual([entryId]);
    // A record drawn from the entry is not a memory drawn from it.
    expect(await store.getMemoriesDrawnFrom(entryId)).toEqual([]);
  });

  it('asks the check-in model, with the forced tool, the ceiling and a timeout, offering only what a model may file', async () => {
    modelFiles([]);

    await answerOpen();

    expect(callTool).toHaveBeenCalledTimes(1);
    const request = callTool.mock.calls[0][0];
    expect(request).toMatchObject({
      model: 'claude-test-checkin',
      maxTokens: config.limits.checkinMaxTokens,
      timeoutMs: config.limits.checkinTimeoutMs,
      messages: [{ role: 'user', content: SENTENCE }],
    });
    expect(request.tool.name).toBe('file_actions');
    const offered = request.tool.inputSchema.properties.actions.items.anyOf.map(
      (/** @type {{ properties: { action: { const: string } } }} */ variant) => variant.properties.action.const
    );
    expect(offered).toEqual(['habit.set', 'habit.skip', 'time.set', 'time.none', 'task.create', 'expense.record']);
    expect(offered).not.toContain('journal.add');
    expect(offered).not.toContain('mood.set');
    expect(offered).not.toContain('energy.set');
    // The params schema is the registry's own, never a copy.
    expect(request.tool.inputSchema.properties.actions.items.anyOf[0].properties.params).toBe(
      registry.getAction('habit.set')?.schema
    );
    // The habits the day asks about, by id, and your categories, by id.
    expect(request.system).toContain('Today is ' + DAY);
    expect(request.system).toContain('habit_move: Move for 30 minutes');
    expect(request.system).toContain('habit_water: Glasses of water (a count');
    expect(request.system).toContain('cat_eating_out: Eating out');
    expect(request.system).toContain('Main current account');
  });

  it.each([
    ['throws', () => callTool.mockRejectedValueOnce(new Error('the model is down'))],
    ['times out', () => callTool.mockRejectedValueOnce(Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' }))],
    ['is cut off at max_tokens', () => modelFiles(GYM_AND_LUNCH, 'max_tokens')],
    ['answers no list', () => callTool.mockResolvedValueOnce({ input: { actions: 'habit.set' }, stopReason: 'tool_use', usage: null })],
    ['answers nothing like the tool', () => callTool.mockResolvedValueOnce({ input: null, stopReason: 'tool_use', usage: null })],
  ])('keeps the entry and files nothing else when the model %s', async (_label, arrange) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    arrange();

    const { lines } = await answerOpen();

    expect(lines.map((line) => [line.name, line.status])).toEqual([['journal.add', 'done']]);
    expect(await journalTexts()).toEqual([SENTENCE]);
    expect((await store.getDailyLog(DAY)).habits.habit_move).toBeUndefined();
    expect(await store.getTransactions()).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ source: 'checkin' })])
    );
    vi.restoreAllMocks();
  });

  it('files what the registry accepts and refuses the rest: an unknown habit, a float amount, an action not offered', async () => {
    modelFiles([
      { action: 'habit.set', params: { habitId: 'habit_gym', value: true } },
      { action: 'expense.record', params: { amount: 12.5, note: 'caffè' } },
      { action: 'money.send', params: { amount: 1000 } },
      { action: 'mood.set', params: { value: 4 } },
      'habit.set',
      { action: 'time.set', params: { area: 'work', minutes: 90 } },
      { action: 'expense.record', params: { amount: 1250, note: 'caffè e cornetto' } },
    ]);

    const { lines } = await answerOpen();

    expect(lines.map((line) => [line.name, line.status])).toEqual([
      ['journal.add', 'done'],
      ['habit.set', 'rejected'],
      ['expense.record', 'rejected'],
      ['time.set', 'done'],
      ['expense.record', 'done'],
    ]);
    expect(lines[1].error).toMatch(/habit_gym/);
    expect(lines[2].error).toMatch(/whole number of cents/);
    expect((await store.getDailyLog(DAY)).time).toEqual({ work: 90 });
    expect((await store.getDailyLog(DAY)).mood).toBeNull();
    const transaction = await store.getTransaction(/** @type {string} */ ((await recordOf(lines[4])).recordRef));
    expect(transaction?.amount).toBe(-1250);
  });

  it('never files the journal entry twice, whatever the model asks', async () => {
    modelFiles([{ action: 'journal.add', params: { text: SENTENCE } }, ...GYM_AND_LUNCH]);

    const { lines } = await answerOpen();

    expect(lines.map((line) => line.name)).toEqual(['journal.add', 'habit.set', 'expense.record']);
    expect(await journalTexts()).toEqual([SENTENCE]);
  });

  it('files nothing more for a sentence with nothing to file', async () => {
    modelFiles([]);

    const { lines } = await answerOpen('Giornata tranquilla, niente di speciale');

    expect(lines.map((line) => line.name)).toEqual(['journal.add']);
  });

  it('does not read the answer when the entry could not be kept', async () => {
    const { lines } = await answerOpen('   ');

    expect(lines.map((line) => line.status)).toEqual(['rejected']);
    expect(callTool).not.toHaveBeenCalled();
  });

  it('reads nothing when no reader is handed in: closed rules alone', async () => {
    const { lines } = await checkin.answerCheckin(DAY, [{ questionId: 'open', value: { text: SENTENCE } }]);

    expect(lines.map((line) => line.name)).toEqual(['journal.add']);
    expect(callTool).not.toHaveBeenCalled();
  });
});

describe('undoing an open answer', () => {
  it('takes back the entry with everything drawn from it', async () => {
    modelFiles(GYM_AND_LUNCH);
    const { lines } = await answerOpen();
    const [entry, , expense] = await Promise.all(lines.map(recordOf));

    expect(await registry.undoAction(entry.id)).toEqual({ ok: true });

    expect(await journalTexts()).toEqual([]);
    expect((await store.getDailyLog(DAY)).habits.habit_move).toBeUndefined();
    expect(await store.getTransaction(/** @type {string} */ (expense.recordRef))).toBeNull();
    expect(await store.getLinks({ to: /** @type {string} */ (entry.recordRef) })).toEqual([]);
    expect((await checkin.checkinReceipt(DAY)).lines.map((line) => [line.name, line.status, line.undoable])).toEqual([
      ['journal.add', 'undone', false],
      ['habit.set', 'undone', false],
      ['expense.record', 'undone', false],
    ]);
  });

  it('takes back one drawn record alone, and keeps the entry', async () => {
    modelFiles(GYM_AND_LUNCH);
    const { lines } = await answerOpen();
    const expense = await recordOf(lines[2]);

    expect(await registry.undoAction(expense.id)).toEqual({ ok: true });

    expect(await journalTexts()).toEqual([SENTENCE]);
    expect((await store.getDailyLog(DAY)).habits.habit_move).toBe(true);
    // The entry is still undone whole: with what is left drawn from it.
    expect(await registry.undoAction(/** @type {string} */ (lines[0].actionId))).toEqual({ ok: true });
    expect((await store.getDailyLog(DAY)).habits.habit_move).toBeUndefined();
  });

  it('refuses to take back the entry once something drawn from it was changed since, and changes nothing', async () => {
    modelFiles(GYM_AND_LUNCH);
    const { lines } = await answerOpen();
    const expense = await recordOf(lines[2]);
    vi.setSystemTime(new Date(NOON.getTime() + 60_000));
    await store.updateTransaction(/** @type {string} */ (expense.recordRef), { categoryId: 'cat_groceries' });

    expect(await registry.undoAction(/** @type {string} */ (lines[0].actionId))).toMatchObject({ ok: false, reason: 'locked' });

    expect(await journalTexts()).toEqual([SENTENCE]);
    expect((await store.getDailyLog(DAY)).habits.habit_move).toBe(true);
    expect((await checkin.checkinReceipt(DAY)).lines.map((line) => [line.name, line.undoable])).toEqual([
      ['journal.add', false],
      ['habit.set', true],
      ['expense.record', false],
    ]);
  });
});

describe('interpretOpenAnswerWithModel', () => {
  /** @type {import('@/lib/checkin/interpret.js').OpenAnswerContext} */
  const CONTEXT = { day: DAY, habits: [], categories: [], accounts: [] };

  it('throws rather than passing a cut-off list for the whole answer', async () => {
    modelFiles(GYM_AND_LUNCH, 'max_tokens');
    await expect(interpret.interpretOpenAnswerWithModel(SENTENCE, { model: 'claude-test', context: CONTEXT })).rejects.toThrow(
      /max_tokens/
    );
  });

  it('returns the shape-checked requests, how many it dropped, and the usage', async () => {
    modelFiles([...GYM_AND_LUNCH, { action: 'journal.add', params: { text: 'x' } }, { action: 'time.none' }, { action: 'time.set', params: [] }]);
    const result = await interpret.interpretOpenAnswerWithModel(SENTENCE, { model: 'claude-test', context: CONTEXT });
    expect(result).toEqual({
      requests: [
        { name: 'habit.set', params: { habitId: 'habit_move', value: true } },
        { name: 'expense.record', params: { amount: 1800, categoryId: 'cat_eating_out', note: 'pranzo' } },
        { name: 'time.none', params: {} },
      ],
      dropped: 2,
      usage: { inputTokens: 900, outputTokens: 80 },
    });
  });

  it('keeps at most MAX_REQUESTS', async () => {
    const many = Array.from({ length: interpret.MAX_REQUESTS + 3 }, () => ({ action: 'time.none', params: {} }));
    modelFiles(many);
    const result = await interpret.interpretOpenAnswerWithModel(SENTENCE, { model: 'claude-test', context: CONTEXT });
    expect(result.requests).toHaveLength(interpret.MAX_REQUESTS);
    expect(result.dropped).toBe(3);
  });
});
