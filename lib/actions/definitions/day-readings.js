/**
 * `mood.set` and `energy.set`: the day's two readings (ADR 0037), each a
 * whole number on one scale, through `setDayMood` and `setDayEnergy`. Given
 * by tap, never read off the journal by a model: neither is model-callable.
 * Undo puts back the reading before, or none. One file for the two, since
 * they differ only by the field.
 */

import { limits } from '../../../personalos.config.js';
import { isDayReading } from '../../domain/day-readings.js';
import { getDailyLog, setDayEnergy, setDayMood } from '../../store.js';
import { accepted, fieldsOf, rejected } from '../params.js';

/**
 * @param {import('../../domain/day-readings.js').DayReading} field
 * @param {string} label
 * @param {(day: string, value: number | null) => Promise<unknown>} write
 * @returns {import('../registry.js').ActionDefinition}
 */
function dayReadingAction(field, label, write) {
  return {
    name: field + '.set',
    risk: 'reversible',
    modelCallable: false,
    schema: {
      type: 'object',
      description: "Set the day's " + field + '.',
      properties: { value: { type: 'integer', minimum: limits.dayReadingMin, maximum: limits.dayReadingMax } },
      required: ['value'],
      additionalProperties: false,
    },

    parse(raw) {
      const { fields, error } = fieldsOf(raw, ['value']);
      if (fields === null) return rejected(error);
      // Setting a reading, not clearing one: null is the store's "unset".
      if (fields.value === null || !isDayReading(fields.value)) {
        return rejected(
          'value must be a whole number from ' + limits.dayReadingMin + ' to ' + limits.dayReadingMax +
            ', received ' + JSON.stringify(fields.value)
        );
      }
      return accepted({ value: fields.value });
    },

    async run(params, ctx) {
      const before = { value: (await getDailyLog(ctx.day))[field] };
      await write(ctx.day, /** @type {number} */ (params.value));
      return { recordRef: null, before };
    },

    async isLocked(record) {
      return (await getDailyLog(record.day))[field] !== record.params.value;
    },

    async undo(record) {
      await write(record.day, /** @type {{ value: number | null }} */ (record.before).value);
    },

    line(params) {
      return label + ' ' + params.value;
    },
  };
}

export const moodSet = dayReadingAction('mood', 'Mood', (date, mood) => setDayMood({ date, mood }));

export const energySet = dayReadingAction('energy', 'Energy', (date, energy) => setDayEnergy({ date, energy }));
