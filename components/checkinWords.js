/**
 * What the check-in's components share (ADR 0037): how a day is named and
 * how each question is put for that day. Kept here, named for the feature,
 * so the card, the summary and the sheet say a day the same way
 * (CODING_STANDARDS, Screens). Pure; English, as Jarvis speaks it. Not
 * `checkin.js`: on a case-insensitive disk that is `Checkin.js`.
 */

import { dayFull, formatMinutes, weekdayName } from '@/components/format.js';
import { shiftDayKey } from '@/lib/domain/dates.js';

/**
 * @typedef {import('@/lib/domain/derive/checkin.js').Question} Question
 * @typedef {import('@/lib/domain/derive/checkin.js').CheckinFill} CheckinFill
 */

/**
 * A day as the panel names it: "Today", "Yesterday", else its weekday --
 * the strip shows seven days, so a weekday names one alone.
 *
 * @param {string} day
 * @param {string} today
 * @returns {string}
 */
export function dayName(day, today) {
  if (day === today) return 'Today';
  if (day === shiftDayKey(today, -1)) return 'Yesterday';
  return weekdayName(day);
}

/**
 * The day inside a sentence: "today", "yesterday", "Friday".
 *
 * @param {string} day
 * @param {string} today
 * @returns {string}
 */
function subject(day, today) {
  const name = dayName(day, today);
  return name === 'Today' || name === 'Yesterday' ? name.toLowerCase() : name;
}

/**
 * When, after a verb: "today", "yesterday", "on Friday".
 *
 * @param {string} day
 * @param {string} today
 * @returns {string}
 */
export function whenSaid(day, today) {
  const said = subject(day, today);
  return said === 'today' || said === 'yesterday' ? said : 'on ' + said;
}

/**
 * The question as the card puts it for its day. A habit is asked by its
 * label; the fixed questions name the day they are about rather than
 * always "today".
 *
 * @param {Question} question
 * @param {string} day
 * @param {string} today
 * @returns {string}
 */
export function questionText(question, day, today) {
  const about = subject(day, today);
  switch (question.kind) {
    case 'mood':
      return 'How did ' + about + ' feel?';
    case 'energy':
      return 'How much energy did ' + about + ' have?';
    case 'time':
      return 'Where did ' + about + "'s time go?";
    case 'open':
      return 'Anything worth noting?';
    default:
      return question.label;
  }
}

/** What a day's fill is called, after its date. */
const FILL_WORDS = Object.freeze({ filled: 'filled', partly: 'partly filled', empty: 'not filled' });

/**
 * A day of the strip as a screen reader says it: "Friday 14 November,
 * filled"; today says so.
 *
 * @param {string} day
 * @param {CheckinFill} fill
 * @param {string} today
 * @returns {string}
 */
export function weekDayLabel(day, fill, today) {
  return dayFull(day) + (day === today ? ', today' : '') + ', ' + FILL_WORDS[fill];
}

/**
 * The headline: "Today · 4 left", "Friday · 1 left", "Yesterday is filled".
 *
 * @param {string} day
 * @param {string} today
 * @param {{ left: number, done: boolean }} progress
 * @returns {string}
 */
export function headline(day, today, { left, done }) {
  const name = dayName(day, today);
  return done ? name + ' is filled' : name + ' · ' + left + ' left';
}

/**
 * Where a habit counted from a time area gets its answer, as its summary
 * line and its row in the sheet say it (ADR 0039).
 *
 * @param {string} area
 * @param {number | null} minutes the area's minutes that day; null when the time is not declared
 * @param {(key: string) => string} areaLabel
 * @returns {string}
 */
export function countedHint(area, minutes, areaLabel) {
  if (minutes === null) return 'From ' + areaLabel(area) + ' time, not declared';
  return minutes > 0 ? 'From ' + areaLabel(area) + ' ' + formatMinutes(minutes) : 'No ' + areaLabel(area) + ' time';
}
