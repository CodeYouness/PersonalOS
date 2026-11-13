/**
 * `habit.skip`: why a habit scheduled on the day was not kept (ADR 0037),
 * through `setHabitSkip`, which refuses a day not scheduled or already kept.
 * Undo puts back the reason before, or none.
 */

import { HABIT_SKIP_REASONS } from '../../../personalos.config.js';
import { HABIT_SKIP_REASON_KEYS, isHabitSkipReason } from '../../domain/habit-skip.js';
import { getDailyLog, setHabitSkip } from '../../store.js';
import { accepted, fieldsOf, rejected } from '../params.js';
import { habitById } from './habit-set.js';

/**
 * @typedef {{ habitId: string, reason: import('../../domain/habit-skip.js').HabitSkipReason }} HabitSkipParams
 */

/** @type {import('../registry.js').ActionDefinition} */
export const habitSkip = {
  name: 'habit.skip',
  risk: 'reversible',
  modelCallable: true,
  schema: {
    type: 'object',
    description: 'Say why a habit scheduled for the day was not kept.',
    properties: {
      habitId: { type: 'string', description: "The habit's id." },
      reason: { type: 'string', enum: [...HABIT_SKIP_REASON_KEYS] },
    },
    required: ['habitId', 'reason'],
    additionalProperties: false,
  },

  async parse(raw) {
    const { fields, error } = fieldsOf(raw, ['habitId', 'reason']);
    if (fields === null) return rejected(error);
    const { habitId, reason } = fields;
    if (!isHabitSkipReason(reason)) {
      return rejected('reason must be one of ' + HABIT_SKIP_REASON_KEYS.join(', ') + ', received ' + JSON.stringify(reason));
    }
    if (typeof habitId !== 'string' || (await habitById(habitId)) === undefined) {
      return rejected('no habit with id ' + JSON.stringify(habitId));
    }
    return accepted({ habitId, reason });
  },

  async run(params, ctx) {
    const { habitId, reason } = /** @type {HabitSkipParams} */ (params);
    const before = (await getDailyLog(ctx.day)).skips[habitId] ?? null;
    await setHabitSkip({ date: ctx.day, habitId, reason });
    return { recordRef: null, before };
  },

  async isLocked(record) {
    const { habitId, reason } = /** @type {HabitSkipParams} */ (record.params);
    return ((await getDailyLog(record.day)).skips[habitId] ?? null) !== reason;
  },

  async undo(record) {
    const { habitId } = /** @type {HabitSkipParams} */ (record.params);
    const before = /** @type {import('../../domain/habit-skip.js').HabitSkipReason | null} */ (record.before);
    await setHabitSkip({ date: record.day, habitId, reason: before });
  },

  async line(params) {
    const { habitId, reason } = /** @type {HabitSkipParams} */ (params);
    return ((await habitById(habitId))?.label ?? habitId) + ': ' + HABIT_SKIP_REASONS[reason];
  },
};
