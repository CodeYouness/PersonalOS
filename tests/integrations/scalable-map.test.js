/**
 * The boundary between `sc`'s euros (JSON numbers) and integer cents
 * (ticket #214, ADR 0031): one exact conversion, and a refusal for a number
 * that is not one.
 */

import { describe, expect, it } from 'vitest';

import { requireRowAmount, toCents } from '../../lib/integrations/scalable/map.js';

describe('toCents', () => {
  it('reads the number\'s decimals, so 1.005 is a tie that rounds up', () => {
    expect(toCents(1.005)).toBe(101);
  });

  it('converts whole and fractional amounts', () => {
    expect(toCents(0)).toBe(0);
    expect(toCents(12.34)).toBe(1234);
    expect(toCents(1234567.89)).toBe(123456789);
  });

  it('rounds a negative tie toward zero and the rest to the nearest cent', () => {
    expect(toCents(-0.005)).toBe(0);
    expect(toCents(-2.504)).toBe(-250);
    expect(toCents(-2.506)).toBe(-251);
  });

  it('refuses what is not a number', () => {
    expect(() => toCents(NaN)).toThrow(/amount/);
  });
});

describe('requireRowAmount', () => {
  it('gives the size of a signed amount', () => {
    expect(requireRowAmount({ id: 'a', amount: -12.5 })).toBe(12.5);
  });

  it('refuses a missing, null, text or non-finite amount, naming the row', () => {
    for (const amount of [undefined, null, 'x', NaN, Infinity]) {
      expect(() => requireRowAmount({ id: 'tx-9', amount })).toThrow(/tx-9 has no usable amount/);
    }
  });
});
