import { describe, expect, it } from 'vitest';

import { dayLabel, formatChange, formatWeight, ordinal, provenanceLabel, slippedLabel } from '@/components/format.js';

describe('provenanceLabel', () => {
  it('names the capture and who filed it', () => {
    expect(provenanceLabel({ createdDayKey: '2026-01-04', source: 'capture', route: 'model' }, '2026-01-05')).toBe(
      'Created 4 Jan from a capture · filed by the model'
    );
    expect(provenanceLabel({ createdDayKey: '2026-01-04', source: 'capture', route: 'rules' }, '2026-01-05')).toBe(
      'Created 4 Jan from a capture · filed by rules'
    );
  });

  it('says a task you made yourself was made by you', () => {
    expect(provenanceLabel({ createdDayKey: '2026-01-04', source: 'user', route: null }, '2026-01-05')).toBe(
      'Created 4 Jan by you'
    );
  });

  it('adds the year once the day is not in this one', () => {
    expect(provenanceLabel({ createdDayKey: '2025-12-30', source: 'user', route: null }, '2026-01-05')).toBe(
      'Created 30 Dec 2025 by you'
    );
  });
});

describe('health formatting', () => {
  it('shows a weight with one decimal, a change signed with a real minus, and a day short', () => {
    expect(formatWeight(75)).toBe('75.0');
    expect(formatChange(-1.2)).toBe('−1.2');
    expect(formatChange(0.4)).toBe('+0.4');
    expect(formatChange(0)).toBe('0');
    expect(dayLabel('2026-01-05')).toBe('Mon 5 Jan');
  });
});

describe('ordinal', () => {
  it('says the English ordinal of a count', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th',
    ]);
  });
});

describe('slippedLabel', () => {
  it('names the period a slipped goal is in', () => {
    expect(slippedLabel(2, 'week')).toBe('2nd week');
    expect(slippedLabel(3, 'month')).toBe('3rd month');
  });
});
