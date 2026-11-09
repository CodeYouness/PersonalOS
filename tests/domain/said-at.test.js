import { describe, expect, it } from 'vitest';

import { resolveSaidAt } from '../../lib/domain/said-at.js';

const NOW = new Date('2026-09-10T10:00:00Z');

describe('resolveSaidAt', () => {
  it('means now when nothing was sent', () => {
    expect(resolveSaidAt(undefined, NOW)).toEqual({ ok: true, saidAt: null });
    expect(resolveSaidAt(null, NOW)).toEqual({ ok: true, saidAt: null });
  });

  it('accepts any instant in the past, however old, normalised to UTC', () => {
    expect(resolveSaidAt('2026-09-09T21:00:00+02:00', NOW)).toEqual({ ok: true, saidAt: '2026-09-09T19:00:00.000Z' });
    expect(resolveSaidAt('2019-01-01T00:00:00Z', NOW)).toEqual({ ok: true, saidAt: '2019-01-01T00:00:00.000Z' });
  });

  it('treats a few minutes ahead as clock drift, which is now', () => {
    expect(resolveSaidAt('2026-09-10T10:02:00Z', NOW)).toEqual({ ok: true, saidAt: null });
  });

  it('refuses an instant further ahead', () => {
    expect(resolveSaidAt('2026-09-11T10:00:00Z', NOW).ok).toBe(false);
  });

  it.each(['yesterday', '2026-09-09', '2026-09-09T10:00:00', '2026-13-09T10:00:00Z', '', 42, {}])(
    'refuses %j as malformed',
    (value) => {
      expect(resolveSaidAt(value, NOW).ok).toBe(false);
    }
  );
});
