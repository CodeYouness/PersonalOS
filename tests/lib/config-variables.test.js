/**
 * lib/config/variables.js -- reading a given set of variables, with no side
 * effects, so the sandbox can say whether `next dev` will call the model
 * before starting it (retro of #158: a key in the shell reached the sandbox
 * with none in .env.local).
 */

import { describe, expect, it } from 'vitest';

import { readModelSettings, readTimezone } from '@/lib/config/variables.js';
import { defaultModels, defaultTimezone } from '@/personalos.config.js';

describe('readModelSettings', () => {
  it('reads the key and a model per call type, trimmed', () => {
    expect(
      readModelSettings({
        ANTHROPIC_API_KEY: ' sk-test ',
        ANTHROPIC_MODEL_CLASSIFY: ' claude-test-classify ',
        ANTHROPIC_MODEL_EXTRACT: ' claude-test-extract ',
        ANTHROPIC_MODEL_ANSWER: ' claude-test-answer ',
      })
    ).toEqual({
      anthropicApiKey: 'sk-test',
      models: { classify: 'claude-test-classify', extract: 'claude-test-extract', answer: 'claude-test-answer' },
    });
  });

  it('reads no key as null, an empty one too, and a missing or empty model as its default', () => {
    expect(readModelSettings({})).toEqual({ anthropicApiKey: null, models: defaultModels });
    expect(
      readModelSettings({ ANTHROPIC_API_KEY: '  ', ANTHROPIC_MODEL_CLASSIFY: '', ANTHROPIC_MODEL_ANSWER: ' ' })
    ).toEqual({ anthropicApiKey: null, models: defaultModels });
  });

  it('overrides one call type without moving the others', () => {
    expect(readModelSettings({ ANTHROPIC_MODEL_ANSWER: 'claude-test-answer' }).models).toEqual({
      ...defaultModels,
      answer: 'claude-test-answer',
    });
  });

  it('no longer reads ANTHROPIC_MODEL: one leftover line cannot undo the split (ADR 0030)', () => {
    expect(readModelSettings({ ANTHROPIC_MODEL: 'claude-test-1' }).models).toEqual(defaultModels);
  });
});

describe('defaultModels', () => {
  it('names a model for every call type, on Sonnet 5.5 until the switch (#198)', () => {
    expect(defaultModels).toEqual({
      classify: 'claude-sonnet-5-5',
      extract: 'claude-sonnet-5-5',
      answer: 'claude-sonnet-5-5',
    });
  });
});

describe('readTimezone', () => {
  it('reads the zone, trimmed, and no zone as the default', () => {
    expect(readTimezone({ USER_TIMEZONE: ' America/New_York ' })).toBe('America/New_York');
    expect(readTimezone({})).toBe(defaultTimezone);
  });

  it('refuses a zone the platform cannot resolve, by name', () => {
    expect(() => readTimezone({ USER_TIMEZONE: 'Mars/Olympus' })).toThrow(/USER_TIMEZONE is not a valid IANA timezone/);
  });
});
