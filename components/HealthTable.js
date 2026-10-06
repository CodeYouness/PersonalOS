'use client';

import { Fragment, useState } from 'react';

import { dayLabel, formatCount, formatWeight } from '@/components/format.js';
import MealList from '@/components/MealList.js';

/**
 * The Health card's table, one row per recorded day. A day with meals opens
 * to show them through the Nutrition card's own MealList, so a meal filed on
 * an earlier day -- "last night I had pizza", said this morning -- can be
 * corrected or deleted where it landed (#87).
 *
 * One day open at a time, tracked by its day key, never by row position: a
 * capture can add a day while one is open. Opening the open day closes it.
 *
 * @param {{
 *   rows: ReturnType<typeof import('@/lib/domain/derive/health.js').healthRows>,
 *   mealsByDay: Record<string, import('@/lib/domain/types.js').Meal[]>,
 *   target: number,
 *   todayKey: string,
 * }} props
 */
export default function HealthTable({ rows, mealsByDay, target, todayKey }) {
  const [openDay, setOpenDay] = useState(/** @type {string | null} */ (null));

  return (
    <table>
      <thead>
        <tr>
          <th>Day</th>
          <th className="num">kcal</th>
          <th className="num">P</th>
          <th className="num">C</th>
          <th className="num">F</th>
          <th className="num">Meals</th>
          <th className="num">kg</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const label = row.date === todayKey ? 'Today' : dayLabel(row.date);
          const isOpen = row.date === openDay && row.meals > 0;
          return (
            <Fragment key={row.date}>
              <tr className={isOpen ? 'is-open' : undefined}>
                <td>
                  {row.meals > 0 ? (
                    <button
                      type="button"
                      className="health-day"
                      aria-expanded={isOpen}
                      onClick={() => setOpenDay(isOpen ? null : row.date)}
                    >
                      {label}
                    </button>
                  ) : (
                    label
                  )}
                </td>
                <td className={'num' + (row.calories !== null && row.calories > target ? ' nutrition-over' : '')}>
                  {known(row.calories)}
                </td>
                <td className="num">{known(row.protein)}</td>
                <td className="num">{known(row.carbs)}</td>
                <td className="num">{known(row.fat)}</td>
                <td className="num">{formatCount(row.meals)}</td>
                <td className="num">{row.weight === null ? '—' : formatWeight(row.weight)}</td>
              </tr>
              {isOpen && (
                <tr className="row-expand">
                  <td colSpan={7}>
                    <MealList meals={mealsByDay[row.date] ?? []} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** @param {number | null} value */
function known(value) {
  return value === null ? '—' : formatCount(value);
}
