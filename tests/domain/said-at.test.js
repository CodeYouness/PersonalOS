import { describe, expect, it } from 'vitest';

import { resolveSaidAt, wasSaidEarlier } from '../../lib/domain/said-at.js';

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

describe('wasSaidEarlier', () => {
  const written = '2026-09-10T10:00:00Z';

  it('is true when said more than the drift before it was written', () => {
    expect(wasSaidEarlier({ createdAt: written, saidAt: '2026-09-10T09:54:00Z' })).toBe(true);
    expect(wasSaidEarlier({ createdAt: written, saidAt: '2026-09-09T22:00:00Z' })).toBe(true);
  });

  it('is false when said at, or within the drift of, the moment it was written', () => {
    expect(wasSaidEarlier({ createdAt: written, saidAt: written })).toBe(false);
    expect(wasSaidEarlier({ createdAt: written, saidAt: '2026-09-10T09:55:00Z' })).toBe(false);
  });

  it('is false for a saidAt after createdAt', () => {
    expect(wasSaidEarlier({ createdAt: written, saidAt: '2026-09-10T10:03:00Z' })).toBe(false);
  });
});
