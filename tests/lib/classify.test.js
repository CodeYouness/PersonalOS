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
    ['paid 20 for coffee', 'finance'],
    ['spent 340 on the accountant', 'finance'],
    ['€45 for the workshop', 'finance'],
    ['ate a chicken sandwich for lunch', 'nutrition'],
    ['workout at the gym this morning', 'health'],
  ])('routes %j to %s', (text, destination) => {
    expect(classifyModule.classifyWithRules(text)).toEqual({
      destination,
      route: 'rules',
      fields: {},
    });
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

    expect(result).toEqual({ destination: 'finance', route: 'model', fields: {} });
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
});
