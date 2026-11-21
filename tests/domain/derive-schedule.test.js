import { describe, expect, it } from 'vitest';

import { instantAt } from '@/lib/domain/dates.js';
import { dueSlot, latestSlot, nextSlot } from '@/lib/domain/derive/schedule.js';

const ROME = 'Europe/Rome';
/** @param {Record<string, unknown>} [over] */
const schedule = (over = {}) => /** @type {any} */ ({
  id: 'prune-runs', time: '07:00', days: [1, 2, 3, 4, 5, 6, 7], engine: 'script', catchUp: 'once', ...over,
});
/** @param {string} iso */
const at = (iso) => new Date(iso);

describe('instantAt', () => {
  it('reads a wall-clock time in the zone, summer and winter', () => {
    expect(instantAt('2026-06-15', '07:00', ROME).toISOString()).toBe('2026-06-15T05:00:00.000Z');
    expect(instantAt('2026-01-15', '07:00', ROME).toISOString()).toBe('2026-01-15T06:00:00.000Z');
  });
});

describe('due derivation', () => {
  it('a schedule never run is due once its time has passed today', () => {
    expect(dueSlot(schedule(), null, at('2026-06-15T05:30:00Z'), ROME)).not.toBeNull();
  });
  it('is not due before its time', () => {
    expect(dueSlot(schedule(), '2026-06-14T05:00:10Z', at('2026-06-15T04:30:00Z'), ROME)).toBeNull();
  });
  it('is not due when it already ran after today\'s slot', () => {
    expect(dueSlot(schedule(), '2026-06-15T05:00:10Z', at('2026-06-15T09:00:00Z'), ROME)).toBeNull();
  });
  it('is due when the time passed during a sleep', () => {
    expect(dueSlot(schedule(), '2026-06-14T05:00:10Z', at('2026-06-15T08:00:00Z'), ROME)).not.toBeNull();
  });
  it('several days slept yields one slot, the latest', () => {
    const slot = dueSlot(schedule(), '2026-06-10T05:00:10Z', at('2026-06-15T08:00:00Z'), ROME);
    expect(slot?.day).toBe('2026-06-15');
  });
  it('same-day across midnight is skipped, same evening is not', () => {
    const reminder = schedule({ time: '21:30', catchUp: 'same-day' });
    expect(dueSlot(reminder, null, at('2026-06-15T21:00:00Z'), ROME)).not.toBeNull(); // 23:00 Rome
    expect(dueSlot(reminder, null, at('2026-06-15T22:30:00Z'), ROME)).toBeNull(); // 00:30 next day
  });
  it('a weekly schedule runs on its day and catches up later in the week', () => {
    const weekly = schedule({ days: [1] }); // 2026-06-15 is a Monday
    expect(dueSlot(weekly, '2026-06-08T05:00:10Z', at('2026-06-17T08:00:00Z'), ROME)?.day).toBe('2026-06-15');
    expect(dueSlot(weekly, '2026-06-15T05:00:10Z', at('2026-06-17T08:00:00Z'), ROME)).toBeNull();
    expect(latestSlot(weekly, at('2026-06-16T08:00:00Z'), ROME)?.day).toBe('2026-06-15');
  });
  it('holds across a daylight-saving change', () => {
    // Rome springs forward on 2026-03-29: 07:00 is 06:00Z the day before, 05:00Z that morning.
    const last = '2026-03-28T06:00:10Z';
    expect(dueSlot(schedule(), last, at('2026-03-29T04:30:00Z'), ROME)).toBeNull();
    expect(dueSlot(schedule(), last, at('2026-03-29T05:00:30Z'), ROME)?.day).toBe('2026-03-29');
  });
  it('nextSlot names the next time it will be due', () => {
    expect(nextSlot(schedule(), at('2026-06-15T08:00:00Z'), ROME).toISOString()).toBe('2026-06-16T05:00:00.000Z');
    expect(nextSlot(schedule({ days: [1] }), at('2026-06-15T08:00:00Z'), ROME).toISOString()).toBe('2026-06-22T05:00:00.000Z');
  });
});
