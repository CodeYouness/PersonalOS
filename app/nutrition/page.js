import NutritionCard from '@/components/NutritionCard.js';
import { today } from '@/lib/domain/dates.js';
import { dayTotals, mealsInOrder } from '@/lib/domain/derive/nutrition.js';
import { getDailyLog, getProfile } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * The Nutrition screen, ported from design/mockup.html's `#screen-nutrition`:
 * one card, for today. It reads the last saved day and never calls the model
 * -- a meal is estimated when it is said, not when it is looked at. Past days
 * belong to Health (docs/spec.md).
 */
export default async function NutritionScreen() {
  const [profile, log] = await Promise.all([getProfile(), getDailyLog(today())]);

  return (
    <section id="screen-nutrition" className="screen is-active">
      <div className="screen-grid">
        <NutritionCard meals={mealsInOrder(log.meals)} totals={dayTotals(log)} target={profile.calorieTarget} />
      </div>
    </section>
  );
}
