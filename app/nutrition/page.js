import HealthCard from '@/components/HealthCard.js';
import NutritionCard from '@/components/NutritionCard.js';
import { shiftDayKey, today } from '@/lib/domain/dates.js';
import { healthAverages, healthRows, weightTrend } from '@/lib/domain/derive/health.js';
import { dayTotals, mealsInOrder } from '@/lib/domain/derive/nutrition.js';
import { getDailyLogs, getProfile } from '@/lib/store.js';
import { limits } from '@/personalos.config.js';

export const dynamic = 'force-dynamic';

/**
 * The Nutrition & Health screen, ported from design/mockup.html's
 * `#screen-nutrition`: today's card, and the Health card for the
 * `healthWindowDays` before it. It reads the saved days and never calls the
 * model -- a meal is estimated when it is said, not when it is looked at.
 */
export default async function NutritionScreen() {
  const todayKey = today();
  const windowDays = limits.healthWindowDays;
  const [profile, logs] = await Promise.all([
    getProfile(),
    getDailyLogs(shiftDayKey(todayKey, -windowDays), todayKey),
  ]);
  const todayLog = logs[logs.length - 1];

  return (
    <section id="screen-nutrition" className="screen is-active">
      <div className="screen-grid">
        <NutritionCard meals={mealsInOrder(todayLog.meals)} totals={dayTotals(todayLog)} target={profile.calorieTarget} />
        <HealthCard
          averages={healthAverages(logs, todayKey)}
          rows={healthRows(logs)}
          mealsByDay={Object.fromEntries(logs.filter((log) => log.meals.length > 0).map((log) => [log.date, mealsInOrder(log.meals)]))}
          weight={weightTrend(logs)}
          target={profile.calorieTarget}
          windowDays={windowDays}
          todayKey={todayKey}
        />
      </div>
    </section>
  );
}
