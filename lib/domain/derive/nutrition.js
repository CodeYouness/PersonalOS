/**
 * Nutrition totals and the health averages.
 *
 * The formula is exact and never goes to the model: 4 kcal per gram of
 * protein, 4 for carbs, 9 for fat. Where an exact formula exists, the formula
 * wins -- it is instant, free, and never wrong.
 */

const KCAL_PER_GRAM = Object.freeze({ protein: 4, carbs: 4, fat: 9 });

/**
 * @param {{ protein: number, carbs: number, fat: number }} macros
 * @returns {number}
 */
export function caloriesFromMacros(macros) {
  return Math.round(
    macros.protein * KCAL_PER_GRAM.protein +
      macros.carbs * KCAL_PER_GRAM.carbs +
      macros.fat * KCAL_PER_GRAM.fat
  );
}

/** The four numbers a meal carries, each of which may be unknown. */
const NUMBERS = /** @type {const} */ (['calories', 'protein', 'carbs', 'fat']);

/**
 * What a day adds up to. Each total sums only the meals that know it, and is
 * `null` when none does -- unknown, not zero (ADR 0019): otherwise the day
 * you skipped the model would look like the day you ate least.
 * `withoutNumbers` counts the meals missing any of the four, so a total that
 * left one out can say so.
 *
 * @param {import('../types.js').DailyLog} log
 * @returns {{ calories: number | null, protein: number | null, carbs: number | null, fat: number | null, meals: number, withoutNumbers: number }}
 */
export function dayTotals(log) {
  /** @param {(typeof NUMBERS)[number]} key */
  const total = (key) => {
    const known = log.meals.map((meal) => meal[key]).filter((value) => value !== null);
    return known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0);
  };
  return {
    calories: total('calories'),
    protein: total('protein'),
    carbs: total('carbs'),
    fat: total('fat'),
    meals: log.meals.length,
    withoutNumbers: log.meals.filter((meal) => NUMBERS.some((key) => meal[key] === null)).length,
  };
}

/**
 * Averages per recorded day, each number over ONLY the days that know it.
 *
 * A day with no meals is a day you did not record, not a day you did not eat.
 * Counting it as zero would make every skipped day flatter the average, and
 * the card would congratulate you for the days you ignored it -- which is the
 * definition of a number that lies. The same holds one level in (ADR 0020): a
 * day whose meals all lack calories is recorded, but not for calories, or
 * every meal said without a model would pull the month down. An average no
 * day knows is `null`, never 0. `days` (how many days each average rests
 * on), `recordedDays` (days with any meal) and `withoutNumbers` (meals
 * missing a number) let the figure carry its own reliability.
 *
 * Which days to pass is the caller's decision -- the Health card leaves
 * today out, since an unfinished day is not a day's eating.
 *
 * @param {import('../types.js').DailyLog[]} logs
 * @returns {{ calories: number | null, protein: number | null, carbs: number | null, fat: number | null, days: Record<(typeof NUMBERS)[number], number>, recordedDays: number, withoutNumbers: number }}
 */
export function averagesOverRecordedDays(logs) {
  const days = logs.filter((log) => log.meals.length > 0).map(dayTotals);
  /** @param {(typeof NUMBERS)[number]} key */
  const known = (key) => days.map((day) => day[key]).filter((value) => value !== null);
  /** @param {(typeof NUMBERS)[number]} key */
  const average = (key) => {
    const values = known(key);
    return values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  };
  return {
    calories: average('calories'),
    protein: average('protein'),
    carbs: average('carbs'),
    fat: average('fat'),
    days: {
      calories: known('calories').length,
      protein: known('protein').length,
      carbs: known('carbs').length,
      fat: known('fat').length,
    },
    recordedDays: days.length,
    withoutNumbers: days.reduce((sum, day) => sum + day.withoutNumbers, 0),
  };
}

/**
 * Where today stands against the calorie target, for the Nutrition card's
 * headline. Before the first meal there is nothing to measure -- "0 of 2,200"
 * would read as a day you ate nothing. Past the target it says by how much,
 * as information, not as a scolding (docs/spec.md).
 *
 * Meals recorded with no calories known are `unknown`, not "0 eaten".
 *
 * @param {{ calories: number | null, meals: number }} totals from dayTotals
 * @param {number} target calorieTarget
 * @returns {{ kind: 'nothing' | 'unknown' } | { kind: 'left' | 'over', kcal: number }}
 */
export function calorieStanding(totals, target) {
  if (totals.meals === 0) return { kind: 'nothing' };
  if (totals.calories === null) return { kind: 'unknown' };
  return totals.calories > target
    ? { kind: 'over', kcal: totals.calories - target }
    : { kind: 'left', kcal: target - totals.calories };
}

/**
 * A day's meals in the order they were eaten. A meal with an unknown time
 * goes last, never guessed into place; among those, the order they were
 * filed.
 *
 * @param {import('../types.js').Meal[]} meals
 * @returns {import('../types.js').Meal[]}
 */
export function mealsInOrder(meals) {
  const key = (/** @type {import('../types.js').Meal} */ meal) => (meal.time ?? '99:99') + meal.createdAt;
  return [...meals].sort((left, right) => key(left).localeCompare(key(right)));
}
