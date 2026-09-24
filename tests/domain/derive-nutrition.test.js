import { describe, expect, it } from 'vitest';

import { calorieStanding, mealsInOrder } from '@/lib/domain/derive/nutrition.js';

/**
 * @param {string} id
 * @param {string | null} time
 */
const meal = (id, time) => ({ id, time, createdAt: '2026-09-24T08:00:00.000Z' });

describe('calorieStanding', () => {
  it('says nothing is recorded before the first meal, not "0 of 2,200"', () => {
    expect(calorieStanding({ calories: 0, meals: 0 }, 2200)).toEqual({ kind: 'nothing' });
  });

  it('says how many calories are left under the target', () => {
    expect(calorieStanding({ calories: 1780, meals: 3 }, 2200)).toEqual({ kind: 'left', kcal: 420 });
  });

  it('says 0 left exactly on the target', () => {
    expect(calorieStanding({ calories: 2200, meals: 3 }, 2200)).toEqual({ kind: 'left', kcal: 0 });
  });

  it('says how many calories over once past the target', () => {
    expect(calorieStanding({ calories: 2450, meals: 4 }, 2200)).toEqual({ kind: 'over', kcal: 250 });
  });

  it('counts a day whose only meal has no numbers as recorded, with the whole target left', () => {
    expect(calorieStanding({ calories: 0, meals: 1 }, 2200)).toEqual({ kind: 'left', kcal: 2200 });
  });
});

describe('mealsInOrder', () => {
  it('orders meals by the time they were eaten, unknown times last', () => {
    const ordered = mealsInOrder(/** @type {any} */ ([meal('a', '13:15'), meal('b', null), meal('c', '08:30')]));
    expect(ordered.map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
  });

  it('keeps meals without a time in the order they were filed', () => {
    const later = { ...meal('late', null), createdAt: '2026-09-24T20:00:00.000Z' };
    const earlier = { ...meal('early', null), createdAt: '2026-09-24T09:00:00.000Z' };
    expect(mealsInOrder(/** @type {any} */ ([later, earlier])).map((entry) => entry.id)).toEqual(['early', 'late']);
  });
});
