/**
 * Habit completion and streaks, computed from the daily logs.
 *
 * Nothing here is stored. A streak recomputed from the logs can never drift
 * away from them, which a stored counter eventually does.
 */

/**
 * A habit counts on a day only inside one of its periods -- half-open, so a
 * period's `to` day itself does not count. "Archived" has no field of its
 * own: it is simply having no period open on that day. See ADR 0015.
 *
 * @param {import('../types.js').Habit} habit
 * @param {string} dayKey
 * @returns {boolean}
 */
export function isActiveOn(habit, dayKey) {
  return habit.periods.some(
    (period) => dayKey >= period.from && (period.to === null || dayKey < period.to)
  );
}

/**
 * How much of a day was completed, 0..1. Checks count whole, counters count
 * in proportion to their target. Only habits active that day count.
 *
 * @param {import('../types.js').Habit[]} habits
 * @param {import('../types.js').DailyLog} log
 * @returns {number}
 */
export function completionRatio(habits, log) {
  const active = habits.filter((habit) => isActiveOn(habit, log.date));
  if (active.length === 0) return 0;

  const total = active.reduce((sum, habit) => {
    const value = log.habits[habit.id];
    if (habit.type === 'check') return sum + (value === true ? 1 : 0);

    const target = habit.target ?? 0;
    if (target <= 0) return sum;
    const done = typeof value === 'number' ? value : 0;
    return sum + Math.min(done / target, 1);
  }, 0);

  return total / active.length;
}

/**
 * True when at least one habit active that day was completed.
 *
 * @param {import('../types.js').Habit[]} habits
 * @param {import('../types.js').DailyLog} log
 * @returns {boolean}
 */
export function hasAnyCompletion(habits, log) {
  return habits.some((habit) => {
    if (!isActiveOn(habit, log.date)) return false;
    const value = log.habits[habit.id];
    if (habit.type === 'check') return value === true;
    return typeof value === 'number' && value > 0;
  });
}

/**
 * Consecutive days with at least one habit completed, counting backwards.
 *
 * A day still in progress does not break the streak: today counts only if
 * something was done, and otherwise the count simply starts from yesterday.
 * Breaking a streak at 00:01 because the day is young would be punishing
 * someone for waking up.
 *
 * @param {import('../types.js').Habit[]} habits
 * @param {import('../types.js').DailyLog[]} logs oldest first, contiguous
 * @param {string} todayKey
 * @returns {number}
 */
export function streak(habits, logs, todayKey) {
  const byDate = new Map(logs.map((log) => [log.date, log]));
  const ordered = [...logs].map((log) => log.date).sort();
  let streakLength = 0;

  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const date = ordered[index];
    const log = byDate.get(date);
    const done = log !== undefined && hasAnyCompletion(habits, log);

    if (done) {
      streakLength += 1;
      continue;
    }
    // Today not yet done is not a break -- the day is not over.
    if (date === todayKey) continue;
    break;
  }

  return streakLength;
}

/**
 * Completion rate per habit over a window, counting only days it was both
 * recorded and active.
 *
 * @param {import('../types.js').Habit[]} habits
 * @param {import('../types.js').DailyLog[]} logs
 * @returns {Record<string, number>} habit id to 0..1
 */
export function ratesByHabit(habits, logs) {
  const recorded = logs.filter((log) => Object.keys(log.habits).length > 0);
  /** @type {Record<string, number>} */
  const rates = {};

  for (const habit of habits) {
    const eligible = recorded.filter((log) => isActiveOn(habit, log.date));
    if (eligible.length === 0) {
      rates[habit.id] = 0;
      continue;
    }
    const total = eligible.reduce((sum, log) => {
      const value = log.habits[habit.id];
      if (habit.type === 'check') return sum + (value === true ? 1 : 0);
      const target = habit.target ?? 0;
      if (target <= 0) return sum;
      return sum + Math.min((typeof value === 'number' ? value : 0) / target, 1);
    }, 0);
    rates[habit.id] = total / eligible.length;
  }

  return rates;
}
