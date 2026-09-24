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

/**
 * What a day adds up to. Only known numbers are summed: a meal whose numbers
 * are unknown (ADR 0019) counts in `meals` and in `withoutNumbers`, never as
 * zero -- otherwise the day you skipped the model would look like the day you
 * ate least. `withoutNumbers` is keyed on calories, the number the headline
 * is measured by.
 *
 * @param {import('../types.js').DailyLog} log
 * @returns {{ calories: number, protein: number, carbs: number, fat: number, meals: number, withoutNumbers: number }}
 */
export function dayTotals(log) {
  return log.meals.reduce(
    (totals, meal) => ({
      calories: totals.calories + (meal.calories ?? 0),
      protein: totals.protein + (meal.protein ?? 0),
      carbs: totals.carbs + (meal.carbs ?? 0),
      fat: totals.fat + (meal.fat ?? 0),
      meals: totals.meals + 1,
      withoutNumbers: totals.withoutNumbers + (meal.calories === null ? 1 : 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0, withoutNumbers: 0 }
  );
}

/**
 * Averages over the window, counting ONLY days with at least one meal.
 *
 * A day with no meals is a day you did not record, not a day you did not eat.
 * Counting it as zero would make every skipped day flatter the average, and
 * the card would congratulate you for the days you ignored it -- which is the
 * definition of a number that lies. `recordedDays` is returned so the figure
 * can carry its own reliability, and `withoutNumbers` says how many meals in
 * those days the sums could not include.
 *
 * @param {import('../types.js').DailyLog[]} logs
 * @returns {{ calories: number, protein: number, carbs: number, fat: number, recordedDays: number, withoutNumbers: number }}
 */
export function averagesOverRecordedDays(logs) {
  const recorded = logs.filter((log) => log.meals.length > 0);
  if (recorded.length === 0) {
    return { calories: 0, protein: 0, carbs: 0, fat: 0, recordedDays: 0, withoutNumbers: 0 };
  }

  const summed = recorded.reduce(
    (totals, log) => {
      const day = dayTotals(log);
      return {
        calories: totals.calories + day.calories,
        protein: totals.protein + day.protein,
        carbs: totals.carbs + day.carbs,
        fat: totals.fat + day.fat,
        withoutNumbers: totals.withoutNumbers + day.withoutNumbers,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, withoutNumbers: 0 }
  );

  return {
    calories: Math.round(summed.calories / recorded.length),
    protein: Math.round(summed.protein / recorded.length),
    carbs: Math.round(summed.carbs / recorded.length),
    fat: Math.round(summed.fat / recorded.length),
    recordedDays: recorded.length,
    withoutNumbers: summed.withoutNumbers,
  };
}

/**
 * Where today stands against the calorie target, for the Nutrition card's
 * headline. Before the first meal there is nothing to measure -- "0 of 2,200"
 * would read as a day you ate nothing. Past the target it says by how much,
 * as information, not as a scolding (docs/spec.md).
 *
 * @param {{ calories: number, meals: number }} totals from dayTotals
 * @param {number} target calorieTarget
 * @returns {{ kind: 'nothing' } | { kind: 'left' | 'over', kcal: number }}
 */
export function calorieStanding(totals, target) {
  if (totals.meals === 0) return { kind: 'nothing' };
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
