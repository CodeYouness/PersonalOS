import { describe, expect, it } from 'vitest';

import { dayAgenda, weekDensity } from '@/lib/domain/derive/calendar.js';

/**
 * @param {Partial<import('@/lib/domain/types.js').Appointment>} overrides
 * @returns {any}
 */
function appointment(overrides) {
  return {
    id: 'appointment_x', title: 't', date: '2026-01-05', startTime: '09:00',
    endTime: null, calendarLabel: 'Personal', origin: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    source: 'user', ...overrides,
  };
}

describe('dayAgenda', () => {
  it('returns only the appointments on the given day, earliest first', () => {
    const agenda = dayAgenda(
      [
        appointment({ id: 'appointment_a', date: '2026-01-05', startTime: '14:00' }),
        appointment({ id: 'appointment_b', date: '2026-01-06', startTime: '08:00' }),
        appointment({ id: 'appointment_c', date: '2026-01-05', startTime: '09:00' }),
      ],
      '2026-01-05'
    );

    expect(agenda.map((entry) => entry.id)).toEqual(['appointment_c', 'appointment_a']);
  });

  it('returns an empty list for a day with nothing on it', () => {
    expect(dayAgenda([appointment({ date: '2026-01-05' })], '2026-01-06')).toEqual([]);
  });
});

describe('weekDensity', () => {
  it('counts appointments per day, capped at 3', () => {
    const week = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11'];
    const appointments = [
      appointment({ id: 'a1', date: '2026-01-05' }),
      appointment({ id: 'a2', date: '2026-01-05' }),
      appointment({ id: 'a3', date: '2026-01-05' }),
      appointment({ id: 'a4', date: '2026-01-05' }),
      appointment({ id: 'a5', date: '2026-01-07' }),
    ];

    expect(weekDensity(appointments, week)).toEqual([3, 0, 1, 0, 0, 0, 0]);
  });

  it('returns zeros for a week with nothing scheduled', () => {
    const week = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11'];

    expect(weekDensity([], week)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
