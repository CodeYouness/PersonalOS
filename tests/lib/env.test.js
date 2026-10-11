/**
 * lib/config/env.js -- the environment, validated once when the module loads.
 * Each case stubs the variables, then imports the module fresh, so what is
 * tested is what every caller meets on import.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('DATA_DIR', () => {
  // An empty value once came from a shell variable that matched nothing, and
  // a data script meant for a sandbox wrote to the real file (#152).
  it('refuses a value that is set but empty', async () => {
    vi.stubEnv('DATA_DIR', '');

    await expect(import('@/lib/config/env.js')).rejects.toThrow(/DATA_DIR/);
  });

  it('refuses a value of only spaces the same way', async () => {
    vi.stubEnv('DATA_DIR', '   ');

    await expect(import('@/lib/config/env.js')).rejects.toThrow(/DATA_DIR/);
  });

  it('means the data directory when unset', async () => {
    vi.stubEnv('DATA_DIR', undefined);

    const { env } = await import('@/lib/config/env.js');

    expect(env.dataDir).toBe('data');
  });

  it('is used as given when it names a directory', async () => {
    vi.stubEnv('DATA_DIR', '/tmp/personalos-sandbox-x');

    const { env } = await import('@/lib/config/env.js');

    expect(env.dataDir).toBe('/tmp/personalos-sandbox-x');
  });
});

describe('the other variables', () => {
  it('still fall back to their defaults when empty', async () => {
    vi.stubEnv('DATA_DIR', '/tmp/personalos-sandbox-x');
    vi.stubEnv('ANTHROPIC_MODEL', '');
    vi.stubEnv('USER_TIMEZONE', '');

    const { env } = await import('@/lib/config/env.js');

    expect(env.anthropicModel).toBe('claude-sonnet-5');
    expect(env.timezone).toBe('Europe/Rome');
  });
});
