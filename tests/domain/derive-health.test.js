import { describe, expect, it } from 'vitest';

import { dayWeight, healthRows, weightTrend } from '@/lib/domain/derive/health.js';

/**
 * @param {string} date
 * @param {{ meals?: any[], weights?: Array<[number, string]> }} [content] weights as [value, createdAt]
 * @returns {any}
 */
function log(date, { meals = [], weights = [] } = {}) {
  return {
    date,
    habits: {},
    notes: [],
    meals,
    measurements: weights.map(([value, createdAt], index) => ({
      id: 'w' + date + index, metric: 'weight', value, unit: 'kg', recordedAt: null, createdAt, updatedAt: createdAt,
    })),
  };
}

const meal = { id: 'm1', time: '08:00', name: 'a', calories: 500, protein: 20, carbs: 60, fat: 15, estimated: false };

describe('health', () => {
  it('reads a day\'s weight as the one filed last, not the first one said', () => {
    expect(dayWeight(log('2026-10-01', { weights: [[74.8, '2026-10-01T09:00:00Z'], [74.4, '2026-10-01T21:00:00Z']] }))).toBe(74.4);
    expect(dayWeight(log('2026-10-01'))).toBeNull();
  });

  it('lists only days with a meal or a weight, newest first', () => {
    const rows = healthRows([
      log('2026-10-01', { meals: [meal] }),
      log('2026-10-02'),
      log('2026-10-03', { weights: [[74.6, '2026-10-03T07:00:00Z']] }),
    ]);

    expect(rows.map((row) => row.date)).toEqual(['2026-10-03', '2026-10-01']);
    expect(rows[0]).toMatchObject({ meals: 0, calories: null, weight: 74.6 });
    expect(rows[1]).toMatchObject({ meals: 1, calories: 500, weight: null });
  });

  it('measures the change from the first weight to the latest, rounded to a tenth', () => {
    const trend = weightTrend([
      log('2026-10-03', { weights: [[74.6, '2026-10-03T07:00:00Z']] }),
      log('2026-09-10', { weights: [[75.8, '2026-09-10T07:00:00Z']] }),
      log('2026-09-20'),
    ]);

    expect(trend).toEqual({ latest: 74.6, change: -1.2, since: '2026-09-10' });
  });

  it('has no change with one weight, and no trend with none', () => {
    expect(weightTrend([log('2026-10-03', { weights: [[74.6, '2026-10-03T07:00:00Z']] })])).toEqual({ latest: 74.6, change: null, since: '2026-10-03' });
    expect(weightTrend([log('2026-10-03', { meals: [meal] })])).toBeNull();
  });
});
