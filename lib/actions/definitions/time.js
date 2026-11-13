/**
 * `time.set` and `time.none`: the day's time declared against areas (ADR
 * 0037), through `setDayTime` and `declareNoTime`. One file for the two:
 * both undo to the same state, a day's time as it was, declared or not.
 *
 * - `time.set` undo puts back the area's minutes before, and takes the day
 *   back to not declared if it was not and nothing else was declared since.
 * - `time.none` undo takes the day back to not declared only if it was not
 *   declared before; on a day already declared it changed nothing.
 */

import { limits, TIME_AREAS } from '../../../personalos.config.js';
import { isTimeArea, isTimeMinutes, TIME_AREA_KEYS } from '../../domain/day-time.js';
import { formatMinutes } from '../../domain/format.js';
import { clearDayTime, declareNoTime, getDailyLog, setDayTime } from '../../store.js';
import { accepted, fieldsOf, rejected } from '../params.js';

/**
 * @typedef {{ area: string, minutes: number }} TimeSetParams
 * @typedef {{ minutes: number, declared: boolean }} TimeSetBefore
 */

/**
 * Takes a day back to not declared if what is left is "declared, nothing".
 *
 * @param {string} day
 * @returns {Promise<void>}
 */
async function undeclareIfEmpty(day) {
  // ponytail: two writes above the adapter (ADR 0011): an area given time
  // between the read and the clear would be cleared with it. Undo is one
  // tap; move this into one adapter write if a second writer appears.
  const { time } = await getDailyLog(day);
  if (time !== null && Object.keys(time).length === 0) await clearDayTime({ date: day });
}

/** @type {import('../registry.js').ActionDefinition} */
export const timeSet = {
  name: 'time.set',
  risk: 'reversible',
  modelCallable: true,
  schema: {
    type: 'object',
    description: 'Declare the time spent on one area today, in half hours. 0 removes the area.',
    properties: {
      area: { type: 'string', enum: [...TIME_AREA_KEYS] },
      minutes: { type: 'integer', minimum: 0, maximum: limits.timeAreaMaxMinutes, multipleOf: limits.timeStepMinutes },
    },
    required: ['area', 'minutes'],
    additionalProperties: false,
  },

  parse(raw) {
    const { fields, error } = fieldsOf(raw, ['area', 'minutes']);
    if (fields === null) return rejected(error);
    const { area, minutes } = fields;
    if (!isTimeArea(area)) return rejected('area must be one of ' + TIME_AREA_KEYS.join(', ') + ', received ' + JSON.stringify(area));
    if (!isTimeMinutes(minutes)) {
      return rejected(
        'minutes must be a multiple of ' + limits.timeStepMinutes + ' from 0 to ' + limits.timeAreaMaxMinutes +
          ', received ' + JSON.stringify(minutes)
      );
    }
    return accepted({ area, minutes });
  },

  async run(params, ctx) {
    const { area, minutes } = /** @type {TimeSetParams} */ (params);
    const { time } = await getDailyLog(ctx.day);
    /** @type {TimeSetBefore} */
    const before = { minutes: time?.[area] ?? 0, declared: time !== null };
    await setDayTime({ date: ctx.day, area, minutes });
    return { recordRef: null, before };
  },

  async isLocked(record) {
    const { area, minutes } = /** @type {TimeSetParams} */ (record.params);
    const { time } = await getDailyLog(record.day);
    return time === null || (time[area] ?? 0) !== minutes;
  },

  async undo(record) {
    const { area } = /** @type {TimeSetParams} */ (record.params);
    const before = /** @type {TimeSetBefore} */ (record.before);
    await setDayTime({ date: record.day, area, minutes: before.minutes });
    if (!before.declared) await undeclareIfEmpty(record.day);
  },

  line(params) {
    const { area, minutes } = /** @type {TimeSetParams} */ (params);
    return TIME_AREAS[area] + ' ' + formatMinutes(minutes);
  },
};

/** @type {import('../registry.js').ActionDefinition} */
export const timeNone = {
  name: 'time.none',
  risk: 'reversible',
  modelCallable: true,
  schema: {
    type: 'object',
    description: 'Declare that the day had no time to declare against any area.',
    properties: {},
    additionalProperties: false,
  },

  parse(raw) {
    const { fields, error } = fieldsOf(raw ?? {}, []);
    if (fields === null) return rejected(error);
    return accepted({});
  },

  async run(_params, ctx) {
    const before = { declared: (await getDailyLog(ctx.day)).time !== null };
    await declareNoTime({ date: ctx.day });
    return { recordRef: null, before };
  },

  async isLocked(record) {
    if (/** @type {{ declared: boolean }} */ (record.before).declared) return false;
    const { time } = await getDailyLog(record.day);
    return time === null || Object.keys(time).length > 0;
  },

  async undo(record) {
    if (!(/** @type {{ declared: boolean }} */ (record.before).declared)) await undeclareIfEmpty(record.day);
  },

  line() {
    return 'No time to declare';
  },
};
