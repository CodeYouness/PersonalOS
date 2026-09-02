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
 * @param {import('../types.js').DailyLog} log
 * @returns {{ calories: number, protein: number, carbs: number, fat: number, meals: number }}
 */
export function dayTotals(log) {
  return log.meals.reduce(
    (totals, meal) => ({
      calories: totals.calories + meal.calories,
      protein: totals.protein + meal.protein,
      carbs: totals.carbs + meal.carbs,
      fat: totals.fat + meal.fat,
      meals: totals.meals + 1,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0 }
  );
}

/**
 * Averages over the window, counting ONLY days with at least one meal.
 *
 * A day with no meals is a day you did not record, not a day you did not eat.
 * Counting it as zero would make every skipped day flatter the average, and
 * the card would congratulate you for the days you ignored it -- which is the
 * definition of a number that lies. `recordedDays` is returned so the figure
 * can carry its own reliability.
 *
 * @param {import('../types.js').DailyLog[]} logs
 * @returns {{ calories: number, protein: number, carbs: number, fat: number, recordedDays: number }}
 */
export function averagesOverRecordedDays(logs) {
  const recorded = logs.filter((log) => log.meals.length > 0);
  if (recorded.length === 0) {
    return { calories: 0, protein: 0, carbs: 0, fat: 0, recordedDays: 0 };
  }

  const summed = recorded.reduce(
    (totals, log) => {
      const day = dayTotals(log);
      return {
        calories: totals.calories + day.calories,
        protein: totals.protein + day.protein,
        carbs: totals.carbs + day.carbs,
        fat: totals.fat + day.fat,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return {
    calories: Math.round(summed.calories / recorded.length),
    protein: Math.round(summed.protein / recorded.length),
    carbs: Math.round(summed.carbs / recorded.length),
    fat: Math.round(summed.fat / recorded.length),
    recordedDays: recorded.length,
  };
}
