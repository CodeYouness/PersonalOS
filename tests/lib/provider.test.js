/**
 * The one seam every model call goes through (ADR 0037, stage 1): a neutral
 * request in, the forced tool's input out. The SDK is mocked the way
 * tests/lib/classify.test.js mocks it, so nothing touches the network.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreate = vi.fn();

const MockAnthropic = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/sdk', () => ({
  // A regular function, not an arrow: `new Anthropic(...)` needs something
  // constructible, and an arrow function's mock implementation is not.
  default: MockAnthropic.mockImplementation(function MockClient() {
    return { messages: { create: mockCreate } };
  }),
}));

/** @type {import('@/lib/ai/provider.js').ToolSpec} */
const TOOL = {
  name: 'file_it',
  description: 'File the sentence.',
  inputSchema: {
    type: 'object',
    properties: { destination: { type: 'string', enum: ['task', 'memory'] } },
    required: ['destination'],
  },
};

/** @type {import('@/lib/ai/provider.js').ToolCallRequest} */
const REQUEST = {
  model: 'claude-test-seam',
  maxTokens: 321,
  system: 'Today is 2026-09-24.',
  tool: TOOL,
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'The question:\nwhat did I promise?' },
        { type: 'text', text: '<context>{}</context>' },
      ],
    },
  ],
};

/** @param {Record<string, unknown>} [overrides] */
function reply(overrides = {}) {
  return {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', name: 'file_it', input: { destination: 'task' } }],
    usage: { input_tokens: 120, output_tokens: 30 },
    ...overrides,
  };
}

describe('callTool', () => {
  /** @type {typeof import('@/lib/ai/provider.js').callTool} */
  let callTool;

  beforeEach(async () => {
    mockCreate.mockReset();
    MockAnthropic.mockClear();
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    ({ callTool } = await import('@/lib/ai/provider.js'));
  });

  it('sends the neutral request as one forced tool call, and nothing else', async () => {
    mockCreate.mockResolvedValueOnce(reply());

    await callTool(REQUEST);

    expect(mockCreate.mock.calls).toHaveLength(1);
    // One argument: no request options when no timeout was asked for.
    expect(mockCreate.mock.calls[0]).toHaveLength(1);
    expect(mockCreate.mock.calls[0][0]).toStrictEqual({
      model: 'claude-test-seam',
      max_tokens: 321,
      system: 'Today is 2026-09-24.',
      tools: [{ name: 'file_it', description: 'File the sentence.', input_schema: TOOL.inputSchema }],
      tool_choice: { type: 'tool', name: 'file_it' },
      messages: REQUEST.messages,
    });
  });

  it('offers the tool instead of forcing it on a model that refuses a forced tool', async () => {
    mockCreate.mockResolvedValueOnce(reply());

    await callTool({ ...REQUEST, model: 'claude-sonnet-5-5' });

    const sent = mockCreate.mock.calls[0][0];
    expect(sent.tool_choice).toStrictEqual({ type: 'auto', disable_parallel_tool_use: true });
    expect(sent.system).toBe(
      'Today is 2026-09-24.\n\nAnswer only by calling the `file_it` tool, exactly once. Write no text before or after the call.'
    );
    expect(sent.tools).toHaveLength(1);
  });

  it.each(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-2', 'claude-fable-5-1', 'claude-sonnet-5-5-20261001'])(
    'does not force the tool on %s',
    async (model) => {
      mockCreate.mockResolvedValueOnce(reply());
      await callTool({ ...REQUEST, model });
      expect(mockCreate.mock.calls[0][0].tool_choice.type).toBe('auto');
    }
  );

  it.each(['claude-haiku-5-5', 'claude-sonnet-5', 'claude-sonnet-5-50'])('still forces the tool on %s', async (model) => {
    mockCreate.mockResolvedValueOnce(reply());
    await callTool({ ...REQUEST, model });
    expect(mockCreate.mock.calls[0][0].tool_choice).toStrictEqual({ type: 'tool', name: 'file_it' });
    expect(mockCreate.mock.calls[0][0].system).toBe('Today is 2026-09-24.');
  });

  it('throws when an unforced model answers in text', async () => {
    mockCreate.mockResolvedValueOnce(reply({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] }));
    await expect(callTool({ ...REQUEST, model: 'claude-sonnet-5-5' })).rejects.toThrow(/did not call file_it/);
  });

  it('builds the client with the configured key', async () => {
    mockCreate.mockResolvedValueOnce(reply());

    await callTool(REQUEST);

    expect(MockAnthropic).toHaveBeenCalledWith({ apiKey: 'test-key' });
  });

  it('passes a timeout as a request option, only when one is given', async () => {
    mockCreate.mockResolvedValueOnce(reply());

    await callTool({ ...REQUEST, timeoutMs: 15_000 });

    expect(mockCreate.mock.calls[0][1]).toStrictEqual({ timeout: 15_000 });
  });

  it("returns the tool call's input, unchecked", async () => {
    mockCreate.mockResolvedValueOnce(
      reply({
        content: [
          { type: 'text', text: 'Filing it.' },
          { type: 'tool_use', name: 'file_it', input: { destination: 'shopping', extra: 1 } },
        ],
      })
    );

    const result = await callTool(REQUEST);

    expect(result.input).toStrictEqual({ destination: 'shopping', extra: 1 });
  });

  it('maps the usage to input and output tokens', async () => {
    mockCreate.mockResolvedValueOnce(reply());

    const result = await callTool(REQUEST);

    expect(result.usage).toStrictEqual({ inputTokens: 120, outputTokens: 30 });
  });

  it.each([
    ['no usage', undefined],
    ['a usage short of a count', { input_tokens: 120 }],
    ['a usage that is not a number', { input_tokens: '120', output_tokens: 30 }],
  ])('reports the usage as null, unknown rather than free, for %s', async (_, usage) => {
    mockCreate.mockResolvedValueOnce(reply({ usage }));

    const result = await callTool(REQUEST);

    expect(result.usage).toBeNull();
  });

  it('passes the stop reason through, and does not judge max_tokens itself', async () => {
    mockCreate.mockResolvedValueOnce(reply({ stop_reason: 'max_tokens' }));

    const result = await callTool(REQUEST);

    expect(result.stopReason).toBe('max_tokens');
    expect(result.input).toStrictEqual({ destination: 'task' });
  });

  it('says the stop reason is unknown when the reply carries none', async () => {
    mockCreate.mockResolvedValueOnce(reply({ stop_reason: undefined }));

    const result = await callTool(REQUEST);

    expect(result.stopReason).toBe('unknown');
  });

  it('throws when the reply holds no tool call', async () => {
    mockCreate.mockResolvedValueOnce(reply({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'I would rather not.' }] }));

    await expect(callTool(REQUEST)).rejects.toThrow(/did not call file_it/);
  });

  it("lets the SDK's own error through", async () => {
    mockCreate.mockRejectedValueOnce(new Error('overloaded'));

    await expect(callTool(REQUEST)).rejects.toThrow('overloaded');
  });
});
