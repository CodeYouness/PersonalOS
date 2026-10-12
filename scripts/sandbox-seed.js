/**
 * The seed `npm run dev:sandbox` starts from (scripts/dev-sandbox.js).
 *
 * The demo habit history is dated January 2026, so on any later day the
 * Habits screen's thirty days are empty, the streak is 0 and no day off ever
 * shows: a browser check of a habit change had to write its own history
 * first. Here each day's habit values move forward together, the newest onto
 * yesterday, so the history and the streak run up to today. A day off is a
 * property of the date, not of the value, so the weekends the history lands
 * on are days off for a habit kept on weekdays.
 *
 * Only the habit values move. Meals, measurements and notes carry instants of
 * their own and stay on the days they were seeded, and the habits' periods
 * stay where they are -- the demo periods open before the history and are
 * still open, so every moved day is inside one. data/seed.json itself is
 * never changed.
 */

import { dayKeyRange, shiftDayKey } from '../lib/domain/dates.js';

/**
 * @template {{ dailyLogs: Record<string, import('../lib/domain/types.js').DailyLog> }} Seed
 * @param {Seed} seed the parsed data/seed.json
 * @param {string} todayKey
 * @returns {Seed} the seed to sandbox: a copy, or the seed itself when its
 *   habit history already ends yesterday or later
 */
export function seedForSandbox(seed, todayKey) {
  const days = Object.keys(seed.dailyLogs)
    .filter((day) => Object.keys(seed.dailyLogs[day].habits).length > 0)
    .sort();
  if (days.length === 0) return seed;

  const yesterday = shiftDayKey(todayKey, -1);
  const newest = days[days.length - 1];
  if (newest >= yesterday) return seed;
  const offset = dayKeyRange(newest, yesterday).length - 1;

  // Every source is read from the seed as given, never from the copy being
  // written, so a move shorter than the history cannot carry a day's values
  // onto a day not yet moved.
  const dailyLogs = structuredClone(seed.dailyLogs);
  for (const day of days) {
    const rest = { ...dailyLogs[day], habits: {} };
    // A day that held only habit values goes, rather than staying behind empty.
    if (rest.meals.length + rest.measurements.length + rest.notes.length === 0) delete dailyLogs[day];
    else dailyLogs[day] = rest;
  }
  for (const day of days) {
    const target = shiftDayKey(day, offset);
    dailyLogs[target] = {
      ...(dailyLogs[target] ?? { date: target, meals: [], measurements: [], notes: [] }),
      habits: structuredClone(seed.dailyLogs[day].habits),
    };
  }
  return { ...seed, dailyLogs };
}
