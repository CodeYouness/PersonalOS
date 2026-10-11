/**
 * lib/config/variables.js -- reading a given set of variables, with no side
 * effects, so the sandbox can say whether `next dev` will call the model
 * before starting it (retro of #158: a key in the shell reached the sandbox
 * with none in .env.local).
 */

import { describe, expect, it } from 'vitest';

import { readModelSettings } from '@/lib/config/variables.js';
import { defaultModel } from '@/personalos.config.js';

describe('readModelSettings', () => {
  it('reads the key and the model, trimmed', () => {
    expect(readModelSettings({ ANTHROPIC_API_KEY: ' sk-test ', ANTHROPIC_MODEL: ' claude-test-1 ' })).toEqual({
      anthropicApiKey: 'sk-test',
      anthropicModel: 'claude-test-1',
    });
  });

  it('reads no key as null, an empty one too, and no model as the default', () => {
    expect(readModelSettings({})).toEqual({ anthropicApiKey: null, anthropicModel: defaultModel });
    expect(readModelSettings({ ANTHROPIC_API_KEY: '  ', ANTHROPIC_MODEL: '' })).toEqual({
      anthropicApiKey: null,
      anthropicModel: defaultModel,
    });
  });
});
