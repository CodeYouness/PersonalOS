import { describe, expect, it } from 'vitest';

import * as screens from '@/components/format.js';
import * as shared from '@/lib/domain/format.js';

// One implementation per format (CODING_STANDARDS.md): the screens and the
// answer's figures write these numbers with the same functions, so the number
// in an answer is the number on the screen. Identity, not equal output: a
// copy that happens to agree today is the copy that drifts.
describe('the formats the screens and the figures share', () => {
  it.each([
    'dayKeyToUtcDate',
    'daysLabel',
    'formatChange',
    'formatCount',
    'formatPercentChange',
    'formatWeight',
    'monthLabel',
    'ordinal',
    'percent',
    'streakLabel',
  ])('%s is the screens\' own', (name) => {
    expect(/** @type {any} */ (shared)[name]).toBeDefined();
    expect(/** @type {any} */ (screens)[name]).toBe(/** @type {any} */ (shared)[name]);
  });

  it('writes a negative with a real minus', () => {
    expect(shared.percent(-0.08)).toBe('−8%');
    expect(shared.formatPercentChange(-0.08)).toBe('−8%');
    expect(shared.formatChange(-1.2)).toBe('−1.2');
  });

  it('names a month in full', () => {
    expect(shared.monthLabel('2026-09')).toBe('September 2026');
  });

  it('names a habit\'s days Monday first, or says every day', () => {
    expect(shared.daysLabel([1, 2, 3, 4, 5, 6, 7])).toBe('Every day');
    expect(shared.daysLabel([1, 3, 5])).toBe('Mon Wed Fri');
    expect(shared.daysLabel([6, 7])).toBe('Sat Sun');
  });
});
