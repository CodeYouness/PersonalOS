/**
 * The seed `npm run dev:sandbox` starts from (scripts/dev-sandbox.js).
 *
 * The demo habit history is dated January 2026, so on any later day the
 * Habits screen's thirty days are empty, the streak is 0 and no day off ever
 * shows: a browser check of a habit change had to write its own history
 * first. Here each day's habit values move forward by whole weeks, so the
 * newest lands in the week ending yesterday and every day keeps its weekday
 * -- a habit's days off stay its days off.
 *
 * Only the habit values move. Meals, measurements and notes carry instants of
 * their own and stay on the days they were seeded; data/seed.json itself is
 * never changed.
 */

import { dayKeyRange, shiftDayKey } from '../lib/domain/dates.js';

/**
 * @param {any} seed the parsed data/seed.json
 * @param {string} todayKey
 * @returns {any} the seed to sandbox: a copy, or the seed itself when its
 *   habit history already ends in the last week
 */
export function seedForSandbox(seed, todayKey) {
  const days = Object.keys(seed.dailyLogs)
    .filter((day) => Object.keys(seed.dailyLogs[day].habits).length > 0)
    .sort();
  if (days.length === 0) return seed;

  const yesterday = shiftDayKey(todayKey, -1);
  const newest = days[days.length - 1];
  if (newest >= yesterday) return seed;
  const offset = Math.floor((dayKeyRange(newest, yesterday).length - 1) / 7) * 7;
  if (offset === 0) return seed;

  const dailyLogs = structuredClone(seed.dailyLogs);
  for (const day of days) {
    const target = shiftDayKey(day, offset);
    dailyLogs[target] = {
      ...(dailyLogs[target] ?? { date: target, meals: [], measurements: [], notes: [] }),
      habits: dailyLogs[day].habits,
    };
    const left = { ...dailyLogs[day], habits: {} };
    // A day that held only habit values goes, rather than staying behind empty.
    if (left.meals.length + left.measurements.length + left.notes.length === 0) delete dailyLogs[day];
    else dailyLogs[day] = left;
  }
  return { ...seed, dailyLogs };
}
