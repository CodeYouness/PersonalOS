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
 * Only the habit values, the day's mood and energy and its declared time move
 * (each is a reading of the day, so it stays with the habits it was given
 * beside). Meals, measurements and notes carry instants of
 * their own and stay on the days they were seeded, and the habits' periods
 * stay where they are -- the demo periods open before the history and are
 * still open, so every moved day is inside one. data/seed.json itself is
 * never changed.
 */

import { ORIGIN_SOURCES } from '../personalos.config.js';
import { dayKeyRange, shiftDayKey, weekDayKeys } from '../lib/domain/dates.js';
import { DAY_READINGS } from '../lib/domain/day-readings.js';

/**
 * @template {{ dailyLogs: Record<string, import('../lib/domain/types.js').DailyLog> }} Seed
 * @param {Seed} seed the parsed data/seed.json
 * @param {string} todayKey
 * @returns {Seed} the seed to sandbox: a copy, or the seed itself when its
 *   habit history already ends yesterday or later
 */
export function seedForSandbox(seed, todayKey) {
  return withReviewInLastWeek(withSyncedHolding(withHabitsEndingYesterday(seed, todayKey)), todayKey);
}

/**
 * The demo review moves to the last completed week, so the Review screen and
 * the lever read it as recent whatever day the sandbox starts. Its instants
 * and its `review.completed` event move by the same number of days. The seed
 * is returned as given when it has no review or the review is already that
 * recent.
 *
 * @template {object} Seed
 * @param {Seed} seed
 * @param {string} todayKey
 * @returns {Seed}
 */
function withReviewInLastWeek(seed, todayKey) {
  const document = /** @type {any} */ (seed);
  if (!Array.isArray(document.reviews) || document.reviews.length === 0) return seed;
  const lastMonday = shiftDayKey(weekDayKeys(todayKey)[0], -7);
  const demo = document.reviews[0];
  if (demo.from >= lastMonday) return seed;
  const days = dayKeyRange(demo.from, lastMonday).length - 1;
  const move = (/** @type {string} */ instant) => new Date(Date.parse(instant) + days * 86_400_000).toISOString();
  return /** @type {Seed} */ ({
    ...document,
    reviews: [
      {
        ...demo,
        from: lastMonday,
        createdAt: move(demo.createdAt),
        updatedAt: move(demo.updatedAt),
        completedAt: demo.completedAt === null ? null : move(demo.completedAt),
      },
      ...document.reviews.slice(1),
    ],
    events: document.events.map((/** @type {any} */ event) =>
      event.subject === demo.id
        ? { ...event, at: move(event.at), date: shiftDayKey(event.date, days) }
        : event
    ),
  });
}

/**
 * The sandbox's one synced holding (ticket #213): an ETF whose trades and
 * prices carry an origin, so a browser check can see a read-only holding
 * before any real sync exists. Invented numbers; skipped when the seed has
 * no finance rows to add to.
 *
 * @template {object} Seed
 * @param {Seed} seed
 * @returns {Seed}
 */
function withSyncedHolding(seed) {
  const document = /** @type {any} */ (seed);
  if (!Array.isArray(document.accounts) || !Array.isArray(document.trades) || !Array.isArray(document.prices)) return seed;
  const at = '2026-01-05T06:00:00.000Z';
  const accountId = 'account_sandbox_synced';
  const origin = (/** @type {string} */ externalId) => ({ source: ORIGIN_SOURCES.scalable, externalId, syncedAt: at, sourceUpdatedAt: null });
  const stamp = { createdAt: at, updatedAt: at, source: 'integration' };
  const trade = (/** @type {string} */ id, /** @type {string} */ date, /** @type {number} */ units, /** @type {number} */ price) => ({
    id, accountId, date, direction: 'buy', units, price, fee: 0, currency: 'EUR', origin: origin('order-' + id), ...stamp,
  });
  return /** @type {Seed} */ ({
    ...document,
    accounts: [
      ...document.accounts,
      {
        id: accountId, name: 'Synced ETF (sandbox)', kind: 'investment', currency: 'EUR', origin: origin('XX0000000001'),
        archivedOn: null, valuation: 'units', ...stamp,
      },
    ],
    trades: [
      ...document.trades,
      trade('trade_sandbox_synced_1', '2025-12-01', 150000000, 9800),
      trade('trade_sandbox_synced_2', '2026-01-02', 50000000, 10100),
    ],
    prices: [
      ...document.prices,
      { id: 'price_sandbox_synced_1', accountId, date: '2025-12-31', price: 10000, currency: 'EUR', ...stamp },
    ],
  });
}

/**
 * The day's mood and energy that were given, and its time if it was declared,
 * as a partial log: a reading left unset, or a day's time not declared (null,
 * or no key in the seed), is not carried. A day declared with nothing (`{}`)
 * is an answer, and is.
 *
 * @param {import('../lib/domain/types.js').DailyLog} log
 * @returns {{ mood?: number, energy?: number, time?: Record<string, number> }}
 */
function readingsOf(log) {
  /** @type {{ mood?: number, energy?: number, time?: Record<string, number> }} */
  const given = {};
  for (const field of DAY_READINGS) {
    const value = log[field];
    if (typeof value === 'number') given[field] = value;
  }
  if (typeof log.time === 'object' && log.time !== null) given.time = structuredClone(log.time);
  return given;
}

/**
 * @param {import('../lib/domain/types.js').DailyLog} log
 * @returns {boolean}
 */
function isRead(log) {
  return Object.keys(readingsOf(log)).length > 0;
}

/**
 * @template {{ dailyLogs: Record<string, import('../lib/domain/types.js').DailyLog> }} Seed
 * @param {Seed} seed
 * @param {string} todayKey
 * @returns {Seed}
 */
function withHabitsEndingYesterday(seed, todayKey) {
  const days = Object.keys(seed.dailyLogs)
    .filter((day) => Object.keys(seed.dailyLogs[day].habits).length > 0 || isRead(seed.dailyLogs[day]))
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
    // A seed day may carry no `mood`, `energy` or `time` key at all, so the shape here is the raw document's.
    const { mood: _mood, energy: _energy, time: _time, ...rest } = /** @type {any} */ ({ ...dailyLogs[day], habits: {} });
    // A day that held only habit values or readings goes, rather than staying behind empty.
    if (rest.meals.length + rest.measurements.length + rest.notes.length === 0) delete dailyLogs[day];
    else dailyLogs[day] = rest;
  }
  for (const day of days) {
    const target = shiftDayKey(day, offset);
    dailyLogs[target] = /** @type {any} */ ({
      ...(dailyLogs[target] ?? { date: target, meals: [], measurements: [], notes: [] }),
      habits: structuredClone(seed.dailyLogs[day].habits),
      ...readingsOf(seed.dailyLogs[day]),
    });
  }
  return { ...seed, dailyLogs };
}
