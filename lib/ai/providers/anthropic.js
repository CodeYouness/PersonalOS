/**
 * The seam's Anthropic side (lib/ai/provider.js): the only module in lib/,
 * app/ or components/ that imports the SDK (eslint.config.mjs). It maps a
 * neutral tool call to `messages.create` and the reply back, and adds
 * nothing of its own -- no retry, no cache, no default timeout.
 *
 * The tool is forced where the model accepts it. Sonnet 5.5, Opus 5.5 and
 * Fable 5.1/5.2 refuse a forced `tool_choice`, so for them the tool is
 * offered with `auto` and asked for in the system prompt (ADR 0030).
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
  const tools = [{ name: tool.name, description: tool.description, input_schema: tool.inputSchema }];
  if (!acceptsForcedTool(model)) {
    // The tool is offered, not forced, and the system prompt asks for it.
    // At most one call; a reply without one throws in `callTool`, as ever.
    return {
      model,
      max_tokens: maxTokens,
      system: system + '\n\n' + unforcedInstruction(tool.name),
      tools,
      tool_choice: { type: /** @type {const} */ ('auto'), disable_parallel_tool_use: true },
      messages,
    };
  }
  return {
    model,
    max_tokens: maxTokens,
    system,
    tools,
    tool_choice: { type: /** @type {const} */ ('tool'), name: tool.name },
    messages,
  };
}

/**
 * The models that answer 400 to a forced `tool_choice` (`tool` or `any`):
 * "not supported for this model". Matched by prefix, so a dated snapshot of
 * one is covered. A new model that refuses it fails loudly on its first
 * call, with the API's own message, and is added here.
 */
const NO_FORCED_TOOL = Object.freeze(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1', 'claude-fable-5-2']);

/**
 * Whether a model accepts a forced `tool_choice`.
 *
 * @param {string} model
 * @returns {boolean}
 */
export function acceptsForcedTool(model) {
  return !NO_FORCED_TOOL.some((id) => model === id || model.startsWith(id + '-'));
}

/**
 * What a model that cannot be forced is told instead, after the caller's
 * system prompt.
 *
 * @param {string} toolName
 * @returns {string}
 */
function unforcedInstruction(toolName) {
  return 'Answer only by calling the `' + toolName + '` tool, exactly once. Write no text before or after the call.';
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
