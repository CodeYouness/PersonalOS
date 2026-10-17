/**
 * `limits.contextMaxChars` against Haiku 5.5's 100K-token price step (#204,
 * ADR 0030). Above 100,000 prompt tokens the whole prompt costs five times
 * more, so a question at the limit must stay at or under 90,000 tokens.
 *
 * The limit counts characters; the step counts tokens. The two constants
 * below turn one into the other. They were measured, not guessed: re-measure
 * with `npm run measure:context` when a model or a kind of record changes,
 * and change them here and in ADR 0030 together.
 */

import { describe, expect, it } from 'vitest';

import { limits } from '@/personalos.config.js';

/**
 * Tokens per character of the context on the worst mix, on
 * `claude-haiku-5-5`: transactions only measured 0.488, rounded up to leave
 * room. ADR 0030, measured 2026-10-17.
 */
const TOKENS_PER_CHAR = 0.52;

/**
 * Tokens a question costs before any context: the instructions, the tool
 * and a short question measured 1,438, rounded up. ADR 0030, measured
 * 2026-10-17.
 */
const FIXED_TOKENS = 1_500;

/** Ten thousand tokens of margin below the 100K-token step. */
const CEILING_TOKENS = 90_000;

describe('limits.contextMaxChars', () => {
  it('keeps a full question on the worst mix under the 90K-token ceiling', () => {
    expect(limits.contextMaxChars * TOKENS_PER_CHAR + FIXED_TOKENS).toBeLessThanOrEqual(CEILING_TOKENS);
  });
});
