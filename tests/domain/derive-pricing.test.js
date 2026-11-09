/**
 * The one exact price a trade has (ADR 0031): a cost in cents over units in
 * 10^-8, rounded half up, in integers -- never through a float -- and the
 * month-end prices of a holding.
 */

import { describe, expect, it } from 'vitest';

import { monthEndPrices, pricePerUnit } from '../../lib/domain/derive/pricing.js';

describe('pricePerUnit', () => {
  it('divides a cost by its units, in cents per unit', () => {
    expect(pricePerUnit(150000, 1500000000)).toBe(10000);
  });

  it('rounds half up on an exact tie', () => {
    expect(pricePerUnit(151, 200000000)).toBe(76);
  });

  it('rounds down just under a tie, where a float division with a rounded guard rounds up', () => {
    // 1 cent over 2.00000002 units is 0.49999999 cents: 0, not 1.
    expect(pricePerUnit(1, 200000002)).toBe(0);
  });

  it('prices the size of a sale, not its sign', () => {
    expect(pricePerUnit(-150000, 1500000000)).toBe(10000);
  });
});

describe('monthEndPrices', () => {
  it('takes the last point on or before each month-end from the first trade on', () => {
    const points = [
      { day: '2026-01-10', price: 100 },
      { day: '2026-02-27', price: 120 },
    ];
    expect(monthEndPrices({ points, firstTradeDay: '2026-01-05', lastDay: '2026-03-15' })).toEqual([
      { date: '2026-01-31', price: 100 },
      { date: '2026-02-28', price: 120 },
    ]);
  });
});
