/**
 * `habit.set`: one habit's value for the day -- ticked or not, or a count --
 * through `logHabitValue`, which clears the day's skip reason when the value
 * completes it. Undo puts back the value before (none at all included: not
 * recorded is not "not done") and the reason completing cleared.
 */

import { clearHabitValue, getDailyLog, getProfile, logHabitValue, setHabitSkip } from '../../store.js';
import { accepted, fieldsOf, rejected } from '../params.js';

/**
 * @param {string} habitId
 * @returns {Promise<import('../../domain/types.js').Habit | undefined>}
 */
export async function habitById(habitId) {
  return (await getProfile()).habits.find((habit) => habit.id === habitId);
}

/**
 * @typedef {{ habitId: string, value: boolean | number }} HabitSetParams
 * @typedef {{ value: boolean | number | null, skip: import('../../domain/habit-skip.js').HabitSkipReason | null }} HabitSetBefore
 */

/** @type {import('../registry.js').ActionDefinition} */
export const habitSet = {
  name: 'habit.set',
  risk: 'reversible',
  modelCallable: true,
  schema: {
    type: 'object',
    description: "Set one habit's value for the day: true or false for a check habit, a count for a counter.",
    properties: {
      habitId: { type: 'string', description: "The habit's id." },
      value: { type: ['boolean', 'integer'], minimum: 0 },
    },
    required: ['habitId', 'value'],
    additionalProperties: false,
  },

  async parse(raw) {
    const { fields, error } = fieldsOf(raw, ['habitId', 'value']);
    if (fields === null) return rejected(error);
    const { habitId, value } = fields;
    // The shape only: which of the two a habit takes is the store's rule
    // (logHabitValue), and a value it refuses is filed as failed.
    if (typeof value !== 'boolean' && !(typeof value === 'number' && Number.isInteger(value) && value >= 0)) {
      return rejected('value must be true, false or a whole number from 0, received ' + JSON.stringify(value));
    }
    if (typeof habitId !== 'string' || (await habitById(habitId)) === undefined) {
      return rejected('no habit with id ' + JSON.stringify(habitId));
    }
    return accepted({ habitId, value });
  },

  async run(params, ctx) {
    const { habitId, value } = /** @type {HabitSetParams} */ (params);
    // ponytail: read-then-write above the adapter (ADR 0011): a tick on the
    // same habit landing between the two would be the one undo restores.
    const log = await getDailyLog(ctx.day);
    /** @type {HabitSetBefore} */
    const before = { value: log.habits[habitId] ?? null, skip: log.skips[habitId] ?? null };
    await logHabitValue({ date: ctx.day, habitId, value });
    return { recordRef: null, before };
  },

  async isLocked(record) {
    const { habitId, value } = /** @type {HabitSetParams} */ (record.params);
    return (await getDailyLog(record.day)).habits[habitId] !== value;
  },

  async undo(record) {
    const { habitId } = /** @type {HabitSetParams} */ (record.params);
    const before = /** @type {HabitSetBefore} */ (record.before);
    if (before.value === null) await clearHabitValue({ date: record.day, habitId });
    else await logHabitValue({ date: record.day, habitId, value: before.value });
    if (before.skip !== null) await setHabitSkip({ date: record.day, habitId, reason: before.skip });
  },

  async line(params) {
    const { habitId, value } = /** @type {HabitSetParams} */ (params);
    const label = (await habitById(habitId))?.label ?? habitId;
    if (typeof value === 'number') return label + ' ' + value;
    return label + (value ? ' ticked' : ' unticked');
  },
};
