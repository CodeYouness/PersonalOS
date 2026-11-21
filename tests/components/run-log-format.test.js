import { describe, expect, it } from 'vitest';

import { formatCostMicros, formatDuration, formatInstant } from '@/components/format.js';

describe('formatDuration', () => {
  it('says milliseconds under a second, seconds under a minute, then minutes', () => {
    expect(formatDuration(0)).toBe('0 ms');
    expect(formatDuration(840)).toBe('840 ms');
    expect(formatDuration(12_340)).toBe('12.3 s');
    expect(formatDuration(125_000)).toBe('2m 05s');
    expect(formatDuration(3_600_000)).toBe('60m 00s');
  });
});

describe('formatCostMicros', () => {
  it('writes dollars to four places from micro-dollars', () => {
    expect(formatCostMicros(400)).toBe('$0.0004');
    expect(formatCostMicros(4_520_000)).toBe('$4.5200');
  });
});

describe('formatInstant', () => {
  it("writes the day and time in the given zone, never the server's", () => {
    expect(formatInstant('2026-06-15T01:30:00Z', 'Europe/Rome')).toBe('15 Jun, 03:30');
    expect(formatInstant('2026-06-15T23:30:00Z', 'Europe/Rome')).toBe('16 Jun, 01:30');
  });
});
