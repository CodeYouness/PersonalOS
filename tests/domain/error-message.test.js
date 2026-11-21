import { describe, expect, it } from 'vitest';

import { errorMessage } from '@/lib/domain/error-message.js';

describe('errorMessage', () => {
  it('reads an Error and anything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('plain')).toBe('plain');
    expect(errorMessage(42)).toBe('42');
  });
});
