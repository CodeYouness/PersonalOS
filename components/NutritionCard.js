import { formatCount } from '@/components/format.js';
import MealBox from '@/components/MealBox.js';
import MealList from '@/components/MealList.js';
import { calorieStanding } from '@/lib/domain/derive/nutrition.js';

/**
 * The Nutrition screen's one card, ported from design/mockup.html's
 * `#card-nutrition`: today's calories against the target, the three macros
 * in grams, and the day's meals in the order they were eaten.
 *
 * Unknown is not zero (ADR 0019): a meal with no numbers shows "—" and is
 * left out of the totals, a total no meal knows is "—" too, and the caption
 * under the headline says how many meals the totals could not fully include. No macro targets and no bars -- the day is
 * measured against `calorieTarget` alone (docs/domain.md).
 *
 * Presentational: the page derives the totals and the order on the server,
 * the same split as HabitsSummary. The client islands are MealBox, the
 * "Describe a meal" box, and MealList, where a meal is corrected in place;
 * both refresh this card once a write lands.
 *
 * @param {{
 *   meals: import('@/lib/domain/types.js').Meal[],
 *   totals: ReturnType<typeof import('@/lib/domain/derive/nutrition.js').dayTotals>,
 *   target: number,
 * }} props
 */
export default function NutritionCard({ meals, totals, target }) {
  const standing = calorieStanding(totals, target);

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
            <span className="display num">{totals.calories === null ? '—' : formatCount(totals.calories)}</span>
            <span className="caption">
              of {formatCount(target)} kcal
              {standing.kind === 'left' && ' · ' + formatCount(standing.kcal) + ' left'}
              {standing.kind === 'over' && (
                <>
                  {' · '}
                  <span className="nutrition-over">{formatCount(standing.kcal)} over</span>
                </>
              )}
            </span>
          </div>
        )}
        {totals.withoutNumbers > 0 && (
          <p className="caption">
            {formatCount(totals.withoutNumbers)} {totals.withoutNumbers === 1 ? 'meal' : 'meals'} missing numbers
          </p>
        )}

        <div className="nutrition-macros">
          <Macro label="Protein" grams={totals.protein} />
          <Macro label="Carbs" grams={totals.carbs} />
          <Macro label="Fat" grams={totals.fat} />
        </div>

        <div className="divider" />
        <MealBox />
        <MealList meals={meals} />
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
