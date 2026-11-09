import { describe, expect, it } from 'vitest';

import { resolveClientId } from '../../lib/domain/client-id.js';

describe('resolveClientId', () => {
  it('means no clientId when none was sent', () => {
    expect(resolveClientId(undefined)).toEqual({ ok: true, clientId: null });
    expect(resolveClientId(null)).toEqual({ ok: true, clientId: null });
  });

  it('accepts a short string, as sent', () => {
    expect(resolveClientId('3f1c9a52-7d0e-4c1b-9a0d-2b6f5e8a1c44')).toEqual({
      ok: true,
      clientId: '3f1c9a52-7d0e-4c1b-9a0d-2b6f5e8a1c44',
    });
  });

  it.each([['a number', 5], ['empty', ''], ['blank', '   '], ['an object', {}], ['too long', 'x'.repeat(201)]])(
    'refuses %s',
    (_name, value) => {
      expect(resolveClientId(value).ok).toBe(false);
    }
  );
});
