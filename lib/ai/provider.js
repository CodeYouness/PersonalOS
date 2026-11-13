/**
 * The one seam every model call goes through (ADR 0037, stage 1). Filing a
 * capture, extracting from a journal entry and answering a question each
 * make one call with one forced tool; they say it here in a shape no
 * provider owns, and only `providers/` knows what a provider's API looks
 * like. Nothing outside `lib/ai/providers/anthropic.js` imports the SDK
 * (eslint.config.mjs).
 *
 * The seam reports, it does not judge. It throws when the reply holds no
 * tool call -- there is nothing to return -- but a reply cut off at the
 * token ceiling comes back with its stop reason, and each caller decides
 * what that means for it, in its own words. The input is returned
 * unchecked: the model's output is untrusted until the caller checks it.
 */

import { callTool as callAnthropicTool } from './providers/anthropic.js';

/**
 * @typedef {object} ToolSpec the one tool a call forces, provider-neutral
 * @property {string} name
 * @property {string} description
 * @property {{ type: 'object' } & Record<string, unknown>} inputSchema a JSON
 *   Schema object for the tool's input
 */

/**
 * @typedef {object} ToolCallMessage
 * @property {'user' | 'assistant'} role
 * @property {string | { type: 'text', text: string }[]} content
 */

/**
 * @typedef {object} ToolCallRequest
 * @property {string} model
 * @property {number} maxTokens the ceiling on the reply
 * @property {string} system
 * @property {ToolSpec} tool
 * @property {ToolCallMessage[]} messages
 * @property {number} [timeoutMs] none unless given: the provider's default
 */

/**
 * @typedef {object} ToolCallResult
 * @property {unknown} input the tool call's input, unchecked
 * @property {string} stopReason the provider's own word for why the reply
 *   ended; `'unknown'` when it gave none
 * @property {{ inputTokens: number, outputTokens: number } | null} usage null
 *   when the reply carried none -- unknown, not free
 */

/**
 * Makes one model call that must answer with `request.tool`.
 *
 * @param {ToolCallRequest} request
 * @returns {Promise<ToolCallResult>}
 */
export function callTool(request) {
  return callAnthropicTool(request);
}
