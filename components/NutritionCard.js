import { formatCount } from '@/components/format.js';
import MealBox from '@/components/MealBox.js';
import { calorieStanding } from '@/lib/domain/derive/nutrition.js';

/**
 * The Nutrition screen's one card, ported from design/mockup.html's
 * `#card-nutrition`: today's calories against the target, the three macros
 * in grams, and the day's meals in the order they were eaten.
 *
 * Unknown is not zero (ADR 0019): a meal with no numbers shows "—" and is
 * left out of the totals, and the caption under the headline says how many
 * the totals could not include. No macro targets and no bars -- the day is
 * measured against `calorieTarget` alone (docs/domain.md).
 *
 * Presentational: the page derives the totals and the order on the server,
 * the same split as HabitsSummary. The one client island is MealBox, the
 * "Describe a meal" box, which refreshes this card once a meal lands.
 *
 * @param {{
 *   meals: import('@/lib/domain/types.js').Meal[],
 *   totals: ReturnType<typeof import('@/lib/domain/derive/nutrition.js').dayTotals>,
 *   target: number,
 * }} props
 */
export default function NutritionCard({ meals, totals, target }) {
  const standing = calorieStanding(totals, target);
  // Before the first meal the grams are not zero, they are nothing yet.
  const recorded = standing.kind !== 'nothing';

  return (
    <article id="card-nutrition" className="card span-6">
      <div className="card-head">
        <span className="eyebrow">Today</span>
        <span className="caption">Target {formatCount(target)} kcal</span>
      </div>
      <div className="card-body">
        {standing.kind === 'nothing' ? (
          <p className="caption">Nothing recorded today</p>
        ) : (
          <div className="nutrition-headline">
            <span className="display num">{formatCount(totals.calories)}</span>
            <span className="caption">
              of {formatCount(target)} kcal ·{' '}
              {standing.kind === 'over' ? (
                <span className="nutrition-over">{formatCount(standing.kcal)} over</span>
              ) : (
                formatCount(standing.kcal) + ' left'
              )}
            </span>
          </div>
        )}
        {totals.withoutNumbers > 0 && (
          <p className="caption">
            {totals.withoutNumbers} {totals.withoutNumbers === 1 ? 'meal' : 'meals'} without numbers
          </p>
        )}

        <div className="nutrition-macros">
          <Macro label="Protein" grams={recorded ? totals.protein : null} />
          <Macro label="Carbs" grams={recorded ? totals.carbs : null} />
          <Macro label="Fat" grams={recorded ? totals.fat : null} />
        </div>

        <div className="divider" />
        <MealBox />
        {meals.map((meal) => (
          <div key={meal.id} className="meal">
            <span className="meal-time num">{meal.time ?? '—'}</span>
            <span className="meal-name">
              {meal.name} {meal.estimated && <span className="badge badge-est">est.</span>}
            </span>
            <span className="meal-kcal num">{meal.calories === null ? '—' : formatCount(meal.calories)}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

/** @param {{ label: string, grams: number | null }} props */
function Macro({ label, grams }) {
  return (
    <div className="macro">
      <div className="macro-head">
        <span className="k">{label}</span>
        <span className="v num">{grams === null ? '—' : formatCount(grams) + ' g'}</span>
      </div>
    </div>
  );
}
