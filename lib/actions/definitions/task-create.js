/**
 * `task.create`: a plain task -- no person, no goal -- through `createTask`,
 * in this week's band unless another is given. Undo deletes it, refused once
 * it was touched since: edited, completed or gone (ADR 0013's rule,
 * `isCaptureRecordLocked`).
 */

import { URGENCY_BANDS } from '../../../personalos.config.js';
import { createTask, deleteTask, getTask, isCaptureRecordLocked } from '../../store.js';
import { accepted, fieldsOf, isText, rejected } from '../params.js';

/** The band a task said in passing lands in: soon, not today. */
const DEFAULT_BAND = 'week';

/** @type {import('../registry.js').ActionDefinition} */
export const taskCreate = {
  name: 'task.create',
  risk: 'reversible',
  modelCallable: true,
  schema: {
    type: 'object',
    description: 'Create a task to do. In this week unless another band is given.',
    properties: {
      title: { type: 'string', minLength: 1 },
      band: { type: 'string', enum: [...URGENCY_BANDS] },
    },
    required: ['title'],
    additionalProperties: false,
  },

  parse(raw) {
    const { fields, error } = fieldsOf(raw, ['title'], ['band']);
    if (fields === null) return rejected(error);
    if (!isText(fields.title)) return rejected('title is required and must be a non-empty string');
    const band = fields.band ?? DEFAULT_BAND;
    if (typeof band !== 'string' || !URGENCY_BANDS.includes(band)) {
      return rejected('band must be one of ' + URGENCY_BANDS.join(', ') + ', received ' + JSON.stringify(band));
    }
    return accepted({ title: fields.title.trim(), band });
  },

  async run(params, ctx) {
    const task = await createTask({ title: params.title, band: params.band, source: ctx.source });
    return { recordRef: task.id, before: null };
  },

  async isLocked(record) {
    const task = await getTask(/** @type {string} */ (record.recordRef));
    return task === null || isCaptureRecordLocked(task);
  },

  async undo(record) {
    await deleteTask(/** @type {string} */ (record.recordRef));
  },

  line(params) {
    return 'Task: ' + params.title;
  },
};
