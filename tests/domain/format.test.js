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
    'formatMinutes',
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

  it('writes time in hours and minutes, leaving out a part that is zero', () => {
    expect(shared.formatMinutes(90)).toBe('1h 30m');
    expect(shared.formatMinutes(120)).toBe('2h');
    expect(shared.formatMinutes(30)).toBe('30m');
    expect(shared.formatMinutes(0)).toBe('0m');
    expect(shared.formatMinutes(1500)).toBe('25h');
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

describe('the receipt wording the capture bar and the capture route share', () => {
  it('says what was filed, and what the receipt adds', () => {
    expect(shared.formatReceiptWhat('Call the accountant')).toBe('Filed \u201cCall the accountant\u201d');
    expect(shared.formatReceiptWhat('I weigh 72', '72 kg')).toBe('Filed \u201cI weigh 72\u201d \u00b7 72 kg');
  });

  it('puts the destination in front for a client that has no badge', () => {
    expect(shared.formatReceiptLine('health', 'I weigh 72', 'no weight filed')).toBe(
      'health \u00b7 Filed \u201cI weigh 72\u201d \u00b7 no weight filed'
    );
  });

  it('says a sentence nothing classified was saved, not filed, and names no destination', () => {
    expect(shared.formatReceiptWhat('call Marta', undefined, 'unclassified')).toBe('Saved \u201ccall Marta\u201d \u00b7 not filed yet');
    expect(shared.formatReceiptLine('memory', 'call Marta', undefined, 'unclassified')).toBe(
      'unclassified \u00b7 Saved \u201ccall Marta\u201d \u00b7 not filed yet'
    );
    expect(shared.formatReceiptLine('task', 'call Marta', undefined, 'model')).toBe('task \u00b7 Filed \u201ccall Marta\u201d');
  });
});
