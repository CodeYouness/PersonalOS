/**
 * The classifier never touches the network in tests: the SDK is mocked, and
 * the "no key configured" path is exercised by never giving it a key.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  // A regular function, not an arrow: `new Anthropic(...)` needs something
  // constructible, and an arrow function's mock implementation is not.
  default: vi.fn().mockImplementation(function MockAnthropic() {
    return { messages: { create: mockCreate } };
  }),
}));

describe('classifyWithRules', () => {
  /** @type {typeof import('@/lib/classify.js')} */
  let classifyModule;

  beforeEach(async () => {
    classifyModule = await import('@/lib/classify.js');
  });

  it.each([
    ['paid 20 for coffee', null],
    ['spent 340 on the accountant', null],
    ['€45 for the workshop', 4500],
  ])('routes %j to finance, reading an amount only next to a euro sign (ADR 0026)', (text, amount) => {
    expect(classifyModule.classifyWithRules(text)).toEqual({
      destination: 'finance',
      route: 'rules',
      fields: { amount, direction: 'out', categoryId: null },
    });
  });

  it.each([
    ['spent € 1.234 on a bike', 123400],
    ['spent 18,40 € 2 coffees', 1840],
    ['paid 18,40€ di cui €2 mancia', 1840],
    ['il 3 100€', 10000],
    ['spent 18,40 euros', 1840],
    ['on 12.10 spent 5€', 500],
    ['spent €0.004', null],
    ['spent 0,00 €', null],
  ])('reads %j as %s minor units', (text, amount) => {
    expect(classifyModule.financeFields(text).amount).toBe(amount);
  });

  it('routes a meal to nutrition', () => {
    expect(classifyModule.classifyWithRules('ate a chicken sandwich for lunch')).toEqual({
      destination: 'nutrition',
      route: 'rules',
      fields: {},
    });
  });

  it.each([
    ['weighed 74.6 kg this morning', 74.6],
    ['peso 74,6kg', 74.6],
    ['74kg oggi', 74],
    ['workout at the gym this morning', null],
    ['weighed 746 kg', null],
    ['weighed 9 kg', null],
    ['weighed 1074 kg', null],
    ['weighed 7.46.2 kg', null],
  ])('routes %j to health with weight %j', (text, weight) => {
    expect(classifyModule.classifyWithRules(text)).toEqual({ destination: 'health', route: 'rules', fields: { weight } });
  });

  it('routes a goal, with the text as its name', () => {
    const result = classifyModule.classifyWithRules('goal: ship the pricing page this week');

    expect(result).toEqual({
      destination: 'goals',
      route: 'rules',
      fields: { title: 'goal: ship the pricing page this week' },
    });
  });

  it('has no rule for people -- a person-shaped capture falls to task, not the model', () => {
    // Documented in classifyWithRules's comment: a keyword heuristic here
    // kept mistaking a task involving a person ("call Marta about the
    // quote") for a CRM note. Without a model, this is the accepted
    // trade-off, not a bug -- the model is what actually tells them apart.
    const result = classifyModule.classifyWithRules('Call Marta about the quote');

    expect(result.destination).toBe('task');
  });

  it('falls back to a task when nothing matches, using the text as the title', () => {
    const result = classifyModule.classifyWithRules('Reply about the workshop dates');

    expect(result).toEqual({
      destination: 'task',
      route: 'rules',
      fields: { title: 'Reply about the workshop dates' },
    });
  });

  it('does not mistake a passing mention of money for an actual transaction', () => {
    // "invoice" and "cost" show up in plenty of tasks that never move money.
    const result = classifyModule.classifyWithRules('Call the accountant about the invoice');

    expect(result.destination).toBe('task');
  });
});

describe('classifyWithRules -- appointment (Italian only, explicit date + time)', () => {
  /** @type {typeof import('@/lib/classify.js')} */
  let classifyModule;

  beforeEach(async () => {
    classifyModule = await import('@/lib/classify.js');
    vi.useFakeTimers();
    // A Thursday, at an hour that stays 2026-09-10 in Europe/Rome (UTC+2).
    vi.setSystemTime(new Date('2026-09-10T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves a weekday named on that same weekday to today', () => {
    const result = classifyModule.classifyWithRules('riunione con Marco giovedì alle 15');

    expect(result).toEqual({
      destination: 'appointment',
      route: 'rules',
      fields: { title: 'riunione con Marco giovedì alle 15', date: '2026-09-10', startTime: '15:00' },
    });
  });

  it('resolves a weekday later in the week to its next occurrence', () => {
    const result = classifyModule.classifyWithRules('dentista lunedì alle 8');

    expect(result.fields.date).toBe('2026-09-14');
    expect(result.fields.startTime).toBe('08:00');
  });

  it('resolves "domani" and "dopodomani" relative to today', () => {
    expect(classifyModule.classifyWithRules('call domani alle 9:30').fields.date).toBe('2026-09-11');
    expect(classifyModule.classifyWithRules('call dopodomani alle 9').fields.date).toBe('2026-09-12');
  });

  it('is unaffected when only a time is stated, no date', () => {
    // The ticket's negative case: without both signals, existing
    // classification behaviour must not change.
    const result = classifyModule.classifyWithRules('call the plumber alle 15');

    expect(result.destination).toBe('task');
  });

  it('is unaffected when only a date is stated, no time', () => {
    const result = classifyModule.classifyWithRules('dentista giovedì');

    expect(result.destination).toBe('task');
  });

  it('is unaffected when neither is stated', () => {
    const result = classifyModule.classifyWithRules('Reply about the workshop dates');

    expect(result).toEqual({
      destination: 'task',
      route: 'rules',
      fields: { title: 'Reply about the workshop dates' },
    });
  });
});

describe('classify (model path)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('never calls the model when no key is configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { classify } = await import('@/lib/classify.js');

    const result = await classify('Reply about the workshop dates');

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.route).toBe('rules');
  });

  it('uses the model classification when it succeeds', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', input: { destination: 'finance' } }],
    });
    const { classify } = await import('@/lib/classify.js');

    const result = await classify('paid the invoice');

    expect(result).toEqual({
      destination: 'finance',
      route: 'model',
      fields: { title: 'paid the invoice', amount: null, direction: 'out', account: null, categoryId: null, date: null },
    });
  });

  it('extracts a task title from the model, falling back to the raw text', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', input: { destination: 'task', title: 'Reply to Tom' } }],
    });
    const { classify } = await import('@/lib/classify.js');

    const result = await classify('reply to tom about the workshop dates whenever you get a chance');

    expect(result).toEqual({ destination: 'task', route: 'model', fields: { title: 'Reply to Tom' } });
  });

  it('extracts a goal name from the model the same way it extracts a task title', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', input: { destination: 'goals', title: 'Ship the pricing page' } }],
    });
    const { classify } = await import('@/lib/classify.js');

    const result = await classify('goal: ship the pricing page this week');

    expect(result).toEqual({ destination: 'goals', route: 'model', fields: { title: 'Ship the pricing page' } });
  });

  it('falls back to rules when the model call rejects', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockCreate.mockRejectedValueOnce(new Error('network error'));
    const { classify } = await import('@/lib/classify.js');

    const result = await classify('paid the invoice');

    expect(result.route).toBe('rules');
    expect(result.destination).toBe('finance');
  });

  it('falls back to rules when the model returns no tool call', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'not a tool call' }] });
    const { classify } = await import('@/lib/classify.js');

    const result = await classify('reply to tom');

    expect(result.route).toBe('rules');
  });

  it('extracts an appointment date and time from the model', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          input: {
            destination: 'appointment',
            title: 'Riunione con Marco',
            date: '2026-09-10',
            startTime: '15:00',
          },
        },
      ],
    });
    const { classify } = await import('@/lib/classify.js');

    const result = await classify('riunione con Marco giovedì alle 15');

    expect(result).toEqual({
      destination: 'appointment',
      route: 'model',
      fields: { title: 'Riunione con Marco', date: '2026-09-10', startTime: '15:00', endTime: undefined },
    });
  });

  it('falls back to rules when the model invents a destination outside the closed vocabulary', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', input: { destination: 'errands' } }],
    });
    const { classify } = await import('@/lib/classify.js');

    const result = await classify('do the errands');

    expect(result.route).toBe('rules');
    expect(result.destination).toBe('task');
  });

  describe('a meal', () => {
    // Thursday 24 September 2026, noon in Rome.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
      process.env.ANTHROPIC_API_KEY = 'test-key';
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** @param {Record<string, unknown>} input */
    async function classifyMeal(input) {
      mockCreate.mockResolvedValueOnce({ content: [{ type: 'tool_use', input: { destination: 'nutrition', ...input } }] });
      const { classify } = await import('@/lib/classify.js');
      return classify('had a carbonara for lunch');
    }

    it('extracts a name, the four numbers, the day and the time', async () => {
      const result = await classifyMeal({
        title: 'Carbonara', calories: 720, protein: 28, carbs: 82, fat: 30, date: '2026-09-23', time: '20:30',
      });

      expect(result).toEqual({
        destination: 'nutrition',
        route: 'model',
        fields: { title: 'Carbonara', calories: 720, protein: 28, carbs: 82, fat: 30, date: '2026-09-23', time: '20:30' },
      });
    });

    it('turns a number out of range into unknown rather than believing it', async () => {
      const result = await classifyMeal({ title: 'Pizza', calories: 9000, protein: -3, carbs: 12.5, fat: 600 });

      expect(result.fields).toMatchObject({ calories: null, protein: null, carbs: null, fat: null });
    });

    it('keeps a number inside its bound', async () => {
      const result = await classifyMeal({ title: 'Feast', calories: 5000, protein: 1250, carbs: 1250, fat: 555 });

      expect(result.fields).toMatchObject({ calories: 5000, protein: 1250, carbs: 1250, fat: 555 });
    });

    it('says nothing about a number or a time the model left out', async () => {
      const result = await classifyMeal({ title: 'Pizza' });

      expect(result.fields).toEqual({ title: 'Pizza', calories: null, protein: null, carbs: null, fat: null, date: null, time: null });
    });

    it('drops a day more than seven days back, or in the future, and a time that is not HH:MM', async () => {
      expect((await classifyMeal({ date: '2026-09-17' })).fields.date).toBe('2026-09-17');
      expect((await classifyMeal({ date: '2026-09-16' })).fields.date).toBeNull();
      expect((await classifyMeal({ date: '2026-09-25' })).fields.date).toBeNull();
      expect((await classifyMeal({ date: 'yesterday' })).fields.date).toBeNull();
      expect((await classifyMeal({ time: '25:00' })).fields.time).toBeNull();
    });
  });

  describe('a weight', () => {
    // Thursday 24 September 2026, noon in Rome.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
      process.env.ANTHROPIC_API_KEY = 'test-key';
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** @param {Record<string, unknown>} input @param {string} [text] */
    async function classifyWeight(input, text = 'mi sono pesato ieri, settantaquattro e due') {
      mockCreate.mockResolvedValueOnce({ content: [{ type: 'tool_use', input: { destination: 'health', ...input } }] });
      const { classify } = await import('@/lib/classify.js');
      return classify(text);
    }

    it('extracts the weight and the day it was taken', async () => {
      const result = await classifyWeight({ weight: 74.2, date: '2026-09-23' });

      expect(result).toEqual({ destination: 'health', route: 'model', fields: { weight: 74.2, date: '2026-09-23' } });
    });

    it('drops a weight out of range, and a day outside the week before', async () => {
      expect((await classifyWeight({ weight: 742 })).fields.weight).toBeNull();
      expect((await classifyWeight({ weight: '74' })).fields.weight).toBeNull();
      expect((await classifyWeight({ weight: 74, date: '2026-09-16' })).fields.date).toBeNull();
    });

    it('files no weight when the model, having read the sentence, gives none', async () => {
      // "benched 100kg" names a kg that is not a body weight: once the model
      // has read the sentence, the rule does not get to overrule it.
      const result = await classifyWeight({}, 'benched 100kg at the gym');

      expect(result.fields).toEqual({ weight: null, date: null });
    });

    it('falls back to the rules when the model call fails', async () => {
      mockCreate.mockRejectedValueOnce(new Error('network error'));
      const { classify } = await import('@/lib/classify.js');

      expect(await classify('weighed 74.6 kg')).toEqual({ destination: 'health', route: 'rules', fields: { weight: 74.6 } });
    });
  });

  describe('a destination chosen up front', () => {
    it('keeps the chosen destination when the model call fails', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      mockCreate.mockRejectedValueOnce(new Error('network error'));
      const { classify } = await import('@/lib/classify.js');

      const result = await classify('pizza with Marta', 'nutrition');

      expect(result).toEqual({ destination: 'nutrition', route: 'rules', fields: {} });
    });

    it('skips classification: the rules would say task, the capture is still a meal', async () => {
      const { classify } = await import('@/lib/classify.js');

      const result = await classify('pizza with Marta', 'nutrition');

      expect(mockCreate).not.toHaveBeenCalled();
      expect(result).toEqual({ destination: 'nutrition', route: 'rules', fields: {} });
    });

    it('asks the model only for that destination', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      mockCreate.mockResolvedValueOnce({ content: [{ type: 'tool_use', input: { destination: 'nutrition', title: 'Pizza', calories: 800 } }] });
      const { classify } = await import('@/lib/classify.js');

      const result = await classify('pizza with Marta', 'nutrition');

      expect(result).toMatchObject({ destination: 'nutrition', route: 'model', fields: { title: 'Pizza', calories: 800 } });
      const request = mockCreate.mock.calls[0][0];
      expect(request.tools[0].input_schema.properties.destination.enum).toEqual(['nutrition']);
    });
  });
});

describe('classifyWithModel (#197)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL_CLASSIFY;
    vi.restoreAllMocks();
  });

  it('asks the model it is given and returns the checked fields with the usage', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', input: { destination: 'finance', amount: 18.4, categoryId: 'cat_invented', date: '2026-09-23' } }],
      usage: { input_tokens: 1834, output_tokens: 61 },
    });
    const { classifyWithModel } = await import('@/lib/classify.js');

    const result = await classifyWithModel('ieri 18,40 al supermercato', {
      model: 'claude-test-eval',
      saidOn: '2026-09-24',
      context: { categories: [{ id: 'cat_food', name: 'Food' }] },
    });

    expect(mockCreate.mock.calls[0][0].model).toBe('claude-test-eval');
    expect(result).toEqual({
      classification: {
        destination: 'finance',
        route: 'model',
        // The invented category is dropped, as it would be on filing.
        fields: { title: 'ieri 18,40 al supermercato', amount: 1840, direction: 'out', account: null, categoryId: null, date: '2026-09-23' },
      },
      usage: { inputTokens: 1834, outputTokens: 61 },
    });
  });

  it('offers only the destinations it is given', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'tool_use', input: { destination: 'health', weight: 74.2 } }] });
    const { classifyWithModel } = await import('@/lib/classify.js');

    await classifyWithModel('settantaquattro e due', { model: 'claude-test-eval', saidOn: '2026-09-24', destinations: ['health'] });

    expect(mockCreate.mock.calls[0][0].tools[0].input_schema.properties.destination.enum).toEqual(['health']);
  });

  it('leaves room for the largest classification it asks for (#207)', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'tool_use', input: { destination: 'nutrition' } }] });
    const { classifyWithModel } = await import('@/lib/classify.js');

    await classifyWithModel('ieri a pranzo insalata con tonno e mais', { model: 'claude-test-eval', saidOn: '2026-09-22' });

    // A meal with every field, time included, measured 205 output tokens on
    // Haiku 5.5: the ceiling keeps twice that.
    expect(mockCreate.mock.calls[0][0].max_tokens).toBeGreaterThanOrEqual(2 * 205);
  });

  it('says what each destination it offers means, and only those (#203)', async () => {
    const { DESTINATIONS } = await import('@/personalos.config.js');
    mockCreate.mockResolvedValue({ content: [{ type: 'tool_use', input: { destination: 'health' } }] });
    const { classifyWithModel } = await import('@/lib/classify.js');

    await classifyWithModel('benched 100kg today', { model: 'claude-test-eval', saidOn: '2026-09-24' });
    await classifyWithModel('benched 100kg today', { model: 'claude-test-eval', saidOn: '2026-09-24', destinations: ['health'] });

    const all = mockCreate.mock.calls[0][0].tools[0].input_schema.properties.destination.description;
    // One "; " between meanings and none inside one, or a meaning reads as two.
    expect(all.split('; ').map((/** @type {string} */ meaning) => meaning.split(' = ')[0])).toEqual([...DESTINATIONS]);
    for (const meaning of all.split('; ')) expect(meaning).toMatch(/^\w+ = \S/);
    const one = mockCreate.mock.calls[1][0].tools[0].input_schema.properties.destination.description;
    expect(one).toMatch(/^health = \S[^;]*$/);
  });

  it('throws, and never falls back to the rules, when the call fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('model not found'));
    const { classifyWithModel } = await import('@/lib/classify.js');

    await expect(classifyWithModel('weighed 74.6 kg', { model: 'claude-retired', saidOn: '2026-09-24' })).rejects.toThrow(
      'model not found'
    );
  });

  it('throws when the model chooses a destination outside the closed vocabulary', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'tool_use', input: { destination: 'shopping' } }] });
    const { classifyWithModel } = await import('@/lib/classify.js');

    await expect(classifyWithModel('buy milk', { model: 'claude-test-eval', saidOn: '2026-09-24' })).rejects.toThrow(
      /outside the closed vocabulary/
    );
  });

  it('is what classify asks, on the classify model, and classify still falls back when it throws', async () => {
    process.env.ANTHROPIC_MODEL_CLASSIFY = 'claude-test-classify';
    mockCreate.mockRejectedValueOnce(new Error('overloaded'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { classify } = await import('@/lib/classify.js');

    const result = await classify('weighed 74.6 kg this morning');

    expect(mockCreate.mock.calls[0][0].model).toBe('claude-test-classify');
    expect(result).toEqual({ destination: 'health', route: 'rules', fields: { weight: 74.6 } });
  });

  it('throws when the reply was cut off at max_tokens: a short tool call is not an answer', async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'max_tokens',
      content: [{ type: 'tool_use', input: { destination: 'nutrition', title: 'Carbonara', calories: 7 } }],
      usage: { input_tokens: 1800, output_tokens: 200 },
    });
    const { classifyWithModel } = await import('@/lib/classify.js');

    await expect(classifyWithModel('had a carbonara', { model: 'claude-test-eval', saidOn: '2026-09-24' })).rejects.toThrow(
      /cut off at max_tokens/
    );
  });

  it('reports no usage, rather than none used, when the reply carries none', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'tool_use', input: { destination: 'memory' } }] });
    const { classifyWithModel } = await import('@/lib/classify.js');

    const { usage } = await classifyWithModel('the bakery is closed on Mondays', { model: 'claude-test-eval', saidOn: '2026-09-24' });

    expect(usage).toBeNull();
  });
});
