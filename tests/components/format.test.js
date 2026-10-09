import { describe, expect, it } from 'vitest';

import {
  dayLabel,
  formatChange,
  formatEuro,
  formatMoney,
  formatMoneyChange,
  formatWeight,
  ordinal,
  parseMoney,
  provenanceLabel,
  shortDate,
  slippedLabel,
} from '@/components/format.js';

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

describe('money formatting', () => {
  it('shows whole euros in a table, rounding the cents half away from zero', () => {
    expect(formatMoney(1240000)).toBe('12,400');
    expect(formatMoney(1240050)).toBe('12,401');
    expect(formatMoney(1240049)).toBe('12,400');
    expect(formatMoney(-50050)).toBe('−501');
    expect(formatMoney(0)).toBe('0');
  });

  it('shows the cents when asked', () => {
    expect(formatMoney(8432055, { cents: true })).toBe('84,320.55');
    expect(formatMoney(-5, { cents: true })).toBe('−0.05');
  });

  it('puts the euro sign in front, with a thin space', () => {
    expect(formatEuro(8432055)).toBe('€\u200984,321');
    expect(formatEuro(-50000)).toBe('−€\u2009500');
  });

  it('signs a change, with a real minus', () => {
    expect(formatMoneyChange(214000)).toBe('+\u20092,140');
    expect(formatMoneyChange(-190500)).toBe('−\u20091,905');
    expect(formatMoneyChange(0)).toBe('0');
  });
});

describe('shortDate', () => {
  it('names the day, and the year only when it is not this one', () => {
    expect(shortDate('2026-01-05', '2026-10-09')).toBe('5 Jan');
    expect(shortDate('2025-06-30', '2026-10-09')).toBe('30 Jun 2025');
  });
});

describe('parseMoney', () => {
  it('reads what you type as euros into cents, without a float', () => {
    expect(parseMoney('12,400')).toBe(1240000);
    expect(parseMoney('84320.55')).toBe(8432055);
    expect(parseMoney(' €1,234.5 ')).toBe(123450);
    expect(parseMoney('0.1')).toBe(10);
    expect(parseMoney('-500')).toBe(-50000);
    expect(parseMoney('−500')).toBe(-50000);
  });

  it('refuses what is not an amount', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('1.234')).toBeNull();
    expect(parseMoney('1.2.3')).toBeNull();
    expect(parseMoney('-')).toBeNull();
  });
});
