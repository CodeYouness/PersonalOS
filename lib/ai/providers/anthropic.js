/**
 * The seam's Anthropic side (lib/ai/provider.js): the only module in lib/,
 * app/ or components/ that imports the SDK (eslint.config.mjs). It maps a
 * neutral tool call to `messages.create` and the reply back, and adds
 * nothing of its own -- no retry, no cache, no default timeout.
 */

import Anthropic from '@anthropic-ai/sdk';

import { env } from '../../config/env.js';

/**
 * The Messages API request a neutral tool call is sent as. Exported so
 * `npm run measure:context` counts the tokens of the very request a question
 * sends (#204): one mapping, so what is measured cannot drift from what is
 * sent.
 *
 * @param {import('../provider.js').ToolCallRequest} request
 */
export function toMessagesRequest({ model, maxTokens, system, tool, messages }) {
  return {
    model,
    max_tokens: maxTokens,
    system,
    tools: [{ name: tool.name, description: tool.description, input_schema: tool.inputSchema }],
    tool_choice: { type: /** @type {const} */ ('tool'), name: tool.name },
    messages,
  };
}

/**
 * @param {import('../provider.js').ToolCallRequest} request
 * @returns {Promise<import('../provider.js').ToolCallResult>}
 */
export async function callTool(request) {
  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const body = toMessagesRequest(request);
  // No options argument unless a timeout was asked for: the SDK's own
  // default applies, as it did before the seam.
  const response = /** @type {any} */ (
    request.timeoutMs === undefined
      ? await client.messages.create(body)
      : await client.messages.create(body, { timeout: request.timeoutMs })
  );

  const stopReason = typeof response.stop_reason === 'string' ? response.stop_reason : 'unknown';
  const toolUse = Array.isArray(response.content)
    ? response.content.find((/** @type {{ type: string }} */ block) => block.type === 'tool_use')
    : undefined;
  if (!toolUse) {
    throw new Error('the model did not call ' + request.tool.name + ' (stop reason: ' + stopReason + ')');
  }

  const usage = response.usage;
  return {
    input: toolUse.input,
    stopReason,
    usage:
      typeof usage?.input_tokens === 'number' && typeof usage?.output_tokens === 'number'
        ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens }
        : null,
  };
}
