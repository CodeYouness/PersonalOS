/**
 * The life figures of the context (#174, ADR 0028): the numbers the Habits,
 * Nutrition & Health and Goals screens already show, each as a citable item.
 *
 * Nothing here is computed. Every number comes from the one implementation in
 * lib/domain/derive/ (rule 6), called over the same days with the same
 * arguments the screens call it with, so the number in an answer is the
 * number on the screen. This module only chooses which results are figures,
 * names their period, and writes them down in words -- including how they
 * count, which is what lets an answer be honest about them ("days without
 * meals are left out, not counted as zero").
 *
 * Where a screen shows "--" there is no figure: an unknown is omitted, never
 * written as zero.
 *
 * The screens read every day of a window, a day with no log as an empty one;
 * the archive holds only the days that have a log. `daysEndingAt` puts the
 * empty days back, because a streak and a window's day count are read across
 * the gaps and would be wrong over the logged days alone.
 */

import { goalsAddress, habitsAddress, nutritionAddress } from '../../domain/addresses.js';
import { dayKeysEndingAt, shiftDayKey } from '../../domain/dates.js';
import { goalBoard } from '../../domain/derive/goals.js';
import { HABITS_WINDOW_DAYS, historyRows, STREAK_WINDOW_DAYS, streak, windowSummary } from '../../domain/derive/habits.js';
import { healthAverages, weightTrend } from '../../domain/derive/health.js';
import { calorieStanding, dayTotals } from '../../domain/derive/nutrition.js';
import { formatChange, formatCount, formatWeight, ordinal, percent, streakLabel } from '../../domain/format.js';
import { limits } from '../../../personalos.config.js';
import { humanDay, joinLines, shortLabel } from './render.js';

/**
 * @typedef {import('./build.js').ContextItem} ContextItem
 */

/**
 * @param {string} id figure:<what>:<period>[:<detail>]
 * @param {string} label
 * @param {string} opens
 * @param {(string | null | false)[]} lines
 * @returns {ContextItem}
 */
function figure(id, label, opens, lines) {
  return { id, type: 'figure', label, content: joinLines(lines), labels: [], opens };
}

/**
 * The life figures, in a stable order: habits, health, today, goals.
 *
 * @param {import('./read.js').Archive} archive
 * @param {{ today: string }} when today's day key, in the user's timezone
 * @returns {ContextItem[]}
 */
export function lifeFigures(archive, { today }) {
  return [
    ...habitFigures(archive, today),
    ...healthFigures(archive, today),
    ...goalFigures(archive, today),
  ];
}

/**
 * The days of a window, oldest first, each as the screen reads it: the
 * archive's log where there is one, an empty log where there is not.
 *
 * @param {import('./read.js').Archive} archive
 * @param {string[]} dayKeys
 * @returns {import('../../domain/types.js').DailyLog[]}
 */
function daysOf(archive, dayKeys) {
  const byDate = new Map(archive.logs.map((log) => [log.date, log]));
  return dayKeys.map((date) => byDate.get(date) ?? { date, habits: {}, meals: [], measurements: [], notes: [] });
}

// --- habits ---------------------------------------------------------------

/**
 * The running streak, the thirty-day completion strip and each habit's rate:
 * what the home card and the Habits screen show.
 *
 * @param {import('./read.js').Archive} archive
 * @param {string} today
 * @returns {ContextItem[]}
 */
function habitFigures(archive, today) {
  const habits = archive.profile.habits;
  // The page reads the streak's longer window once and slices the thirty days
  // off its end; so does this, and for the same reason: one streak, one answer.
  const streakLogs = daysOf(archive, dayKeysEndingAt(STREAK_WINDOW_DAYS, today));
  const windowLogs = streakLogs.slice(-HABITS_WINDOW_DAYS);
  const period = HABITS_WINDOW_DAYS + 'd';
  const range = humanDay(windowLogs[0].date) + ' to ' + humanDay(today);

  const streakDays = streak(habits, streakLogs, today);
  const summary = windowSummary(habits, windowLogs);

  return [
    figure('figure:habit-streak:now', 'Habit streak, to ' + humanDay(today), habitsAddress(), [
      'Current habit streak as of ' + humanDay(today) + ': ' + streakLabel(streakDays) + (streakDays === 1 ? ' day' : ' days') + '.',
      'It counts the days in a row, back from today, on which at least one habit scheduled that day was completed. A day with no habit scheduled is skipped: it neither extends nor breaks the streak. Today counts only if something is done; a day not done yet is not a break.',
      'It looks back at most ' + STREAK_WINDOW_DAYS + ' days.',
    ]),
    figure('figure:habit-completion:' + period, 'Habit completion, last ' + HABITS_WINDOW_DAYS + ' days', habitsAddress(), [
      summary.recordedDays === 0
        ? 'Habit completion over the ' + summary.days + ' days from ' + range + ': none of these days has a recorded habit, so there is no completion to state.'
        : 'Habit completion over the ' + summary.days + ' days from ' + range + ': ' + percent(summary.completion) + ', the average over the recorded days.',
      'Perfect days (every habit scheduled that day complete): ' + summary.perfectDays + ' of ' + summary.recordedDays + ' recorded days.',
      'Days recorded: ' + summary.recordedDays + ' of ' + summary.days + '.',
      'Days with nothing recorded, and days no habit was scheduled on, are left out of the average, not counted as zero. A habit done on a day it was not scheduled counts toward nothing.',
    ]),
    ...historyRows(habits, windowLogs)
      // A rate rests on the days the habit was scheduled and something was
      // recorded. With none the screen's 0% is only the derivation's
      // convention, and stated it would read as "never did it": unknown, so
      // no figure (the derivation says how many days it rests on).
      .filter((row) => row.ratedDays > 0)
      .map((row) =>
        figure(
          'figure:habit-rate:' + row.habit.id + ':' + period,
          shortLabel('Habit rate, ' + row.habit.label + ' (' + HABITS_WINDOW_DAYS + ' days)'),
          habitsAddress(),
          [
            'Completion rate of the habit "' + row.habit.label + '" over the ' + windowLogs.length + ' days from ' + range + ': ' + percent(row.rate) + '.',
            'It rests on ' + row.ratedDays + (row.ratedDays === 1 ? ' day' : ' days') + ': only the days the habit was scheduled and something was recorded count; other days, its days off among them, are left out, not counted as zero.',
            row.archived && 'The habit is archived: its scheduled days from when it was active still count.',
          ]
        )
      ),
  ];
}

// --- health and nutrition ---------------------------------------------------

/**
 * The Health card's averages and weight, and the Nutrition card's day: the
 * logs are the `healthWindowDays` before today and today, as the page reads
 * them.
 *
 * @param {import('./read.js').Archive} archive
 * @param {string} today
 * @returns {ContextItem[]}
 */
function healthFigures(archive, today) {
  const windowDays = limits.healthWindowDays;
  const target = archive.profile.calorieTarget;
  const period = windowDays + 'd';
  const logs = daysOf(archive, dayKeysEndingAt(windowDays + 1, today));
  const todayLog = logs[logs.length - 1];
  const averages = healthAverages(logs, today);
  const weight = weightTrend(logs);
  const totals = dayTotals(todayLog);
  const standing = calorieStanding(totals, target);

  const averageRange = humanDay(shiftDayKey(today, -windowDays)) + ' to ' + humanDay(shiftDayKey(today, -1));
  const averageCaveats = [
    'Days with no meals are left out, not counted as zero. Today is not averaged: it is still being eaten.',
    averages.withoutNumbers > 0 &&
      averages.withoutNumbers + (averages.withoutNumbers === 1 ? ' meal' : ' meals') + ' missing numbers, left out of the averages that need them.',
  ];
  /**
   * One average of the Health card, or nothing when no recorded day knows it.
   *
   * @param {'calories' | 'protein' | 'carbs' | 'fat'} metric
   * @param {string} name
   * @param {string} unit
   * @param {(string | false)[]} [extra]
   * @returns {ContextItem[]}
   */
  const average = (metric, name, unit, extra = []) => {
    const value = averages[metric];
    if (value === null) return [];
    const known = averages.days[metric];
    return [
      figure('figure:health-' + metric + '-avg:' + period, 'Average ' + name + ', last ' + windowDays + ' days', nutritionAddress(), [
        'Average daily ' + name + ' over the ' + windowDays + ' days before today (' + averageRange + '): ' + formatCount(value) + ' ' + unit + ', from ' + known + (known === 1 ? ' day' : ' days') + ' that record it.',
        ...extra,
        ...averageCaveats,
      ]),
    ];
  };

  /**
   * One macro or the calories of today, or nothing when no meal knows it.
   *
   * @param {'calories' | 'protein' | 'carbs' | 'fat'} metric
   * @param {string} name
   * @param {string} unit
   * @param {(string | false)[]} [extra]
   * @returns {ContextItem[]}
   */
  const eatenToday = (metric, name, unit, extra = []) => {
    const value = totals[metric];
    if (value === null) return [];
    return [
      figure('figure:' + metric + ':today', capitalise(name) + ' today, ' + humanDay(today), nutritionAddress(), [
        capitalise(name) + ' eaten today (' + humanDay(today) + '): ' + formatCount(value) + ' ' + unit + '.',
        ...extra,
        totals.withoutNumbers > 0 &&
          totals.withoutNumbers + (totals.withoutNumbers === 1 ? ' meal' : ' meals') + ' missing numbers, left out of this total.',
      ]),
    ];
  };

  return [
    ...average('calories', 'calories', 'kcal', [
      'The calorie target is ' + formatCount(target) + ' kcal; this average is ' + (averages.calories !== null && averages.calories > target ? 'above' : 'at or below') + ' it.',
    ]),
    ...average('protein', 'protein', 'g'),
    ...average('carbs', 'carbs', 'g'),
    ...average('fat', 'fat', 'g'),
    ...(weight === null
      ? []
      : [
          figure('figure:weight:latest', 'Latest weight', nutritionAddress(), [
            'Latest recorded weight in the last ' + windowDays + ' days, up to ' + humanDay(today) + ': ' + formatWeight(weight.latest) + ' kg.',
            'A day with several weights counts the one filed last.',
          ]),
          ...(weight.change === null
            ? []
            : [
                figure('figure:weight-change:' + period, 'Weight change since ' + humanDay(weight.since), nutritionAddress(), [
                  'Weight change over the last ' + windowDays + ' days: ' + formatChange(weight.change) + ' kg, from the first recorded weight (' + humanDay(weight.since) + ') to the latest (' + formatWeight(weight.latest) + ' kg).',
                ]),
              ]),
        ]),
    ...(standing.kind === 'nothing'
      ? []
      : [
          ...eatenToday('calories', 'calories', 'kcal', [
            'The calorie target is ' + formatCount(target) + ' kcal' + standingText(standing) + '.',
          ]),
          ...eatenToday('protein', 'protein', 'g'),
          ...eatenToday('carbs', 'carbs', 'g'),
          ...eatenToday('fat', 'fat', 'g'),
        ]),
  ];
}

/**
 * How today stands against the target, as the Nutrition card's headline
 * says it: what is left, or by how much it is over.
 *
 * @param {ReturnType<typeof calorieStanding>} standing
 * @returns {string}
 */
function standingText(standing) {
  if (standing.kind === 'left') return '; ' + formatCount(standing.kcal) + ' kcal left';
  if (standing.kind === 'over') return '; ' + formatCount(standing.kcal) + ' kcal over';
  return '';
}

// --- goals -------------------------------------------------------------------

/**
 * The open goals' progress and how far each has slipped, over the board the
 * Goals card and screen draw. A done goal is not on it: it has neither.
 *
 * @param {import('./read.js').Archive} archive
 * @param {string} today
 * @returns {ContextItem[]}
 */
function goalFigures(archive, today) {
  return goalBoard(archive.goals, today).groups.flatMap(({ rows }) =>
    rows.flatMap(({ goal, slipped }) => [
      ...(goal.progress === null
        ? []
        : [
            figure('figure:goal-progress:' + goal.id, shortLabel('Progress, ' + goal.name), goalsAddress(goal.id), [
              'Progress of the goal "' + goal.name + '": ' + goal.progress.current + ' of ' + goal.progress.target + '.',
              'This is the progress set on the goal itself; nothing derives it.',
            ]),
          ]),
      ...(slipped === null || goal.horizon === 'open'
        ? []
        : [
            figure('figure:goal-slip:' + goal.id, shortLabel('Slipped, ' + goal.name), goalsAddress(goal.id), [
              'The goal "' + goal.name + '" has slipped: its ' + goal.horizon + ' horizon was chosen on ' + humanDay(goal.horizonSetOn) + ' and it is now in its ' + ordinal(slipped) + ' ' + goal.horizon + ' (as of ' + humanDay(today) + ').',
              'A goal never expires or closes by itself; this only says how long past its first ' + goal.horizon + ' it is.',
            ]),
          ]),
    ])
  );
}

/**
 * @param {string} text
 * @returns {string}
 */
function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
