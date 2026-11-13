/**
 * A closed answer to a check-in question, turned into action requests by
 * rules -- the first tier of ADR 0037's router, with no model anywhere. Each
 * question's kind takes one or more shapes of answer:
 *
 * | Question | Answer | Requests |
 * | --- | --- | --- |
 * | habit | `{ done: true }` | `habit.set`: `true` for a check, that day's target for a counter |
 * | habit (counter) | `{ value: n }` | `habit.set` to the count |
 * | habit | `{ skip: reason }` | `habit.skip` |
 * | mood, energy | `{ value }` | `mood.set`, `energy.set` |
 * | time | `{ areas: { <area>: minutes, ... } }` | one `time.set` per area, in the order given |
 * | time | `{ none: true }` | `time.none` |
 * | open | `{ text }` | `journal.add`, word for word |
 *
 * Only the shape is checked here: a value that does not fit its question's
 * kind is refused. The values themselves -- a reason in the list, a reading
 * on the scale, minutes on the step, text with something in it -- are the
 * actions' `parse` to check, so a rule has one home (lib/actions/).
 *
 * The open answer is only a journal entry for now; reading it for records
 * is the next ticket's.
 */

/**
 * @typedef {{ ok: true, requests: import('../actions/registry.js').ActionRequest[] } | { ok: false, error: string }} AnswerResult
 */

/**
 * @param {string} error
 * @returns {AnswerResult}
 */
function refused(error) {
  return { ok: false, error };
}

/**
 * @param {import('../actions/registry.js').ActionRequest[]} requests
 * @returns {AnswerResult}
 */
function filed(requests) {
  return { ok: true, requests };
}

/**
 * The answer as an object naming exactly one of `shapes`, with its value, or
 * why it is not one.
 *
 * @param {unknown} value
 * @param {readonly string[]} shapes
 * @returns {{ key: string, field: unknown, error: null } | { key: null, field: null, error: string }}
 */
function oneOf(value, shapes) {
  const expected = shapes.map((key) => '{ ' + key + ' }').join(' or ');
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { key: null, field: null, error: 'an answer must be ' + expected + ', received ' + JSON.stringify(value ?? null) };
  }
  const keys = Object.keys(value);
  if (keys.length !== 1 || !shapes.includes(keys[0])) {
    return { key: null, field: null, error: 'an answer must be ' + expected + ', received ' + JSON.stringify(value) };
  }
  return { key: keys[0], field: /** @type {Record<string, unknown>} */ (value)[keys[0]], error: null };
}

/**
 * @param {import('../domain/derive/checkin.js').Question} question
 * @param {unknown} value
 * @returns {AnswerResult}
 */
function habitAnswer(question, value) {
  const habitId = question.subjectId;
  if (typeof habitId !== 'string') return refused('the question ' + question.id + ' names no habit');
  const counter = question.habitType === 'counter';
  const { key, field, error } = oneOf(value, counter ? ['done', 'value', 'skip'] : ['done', 'skip']);
  if (key === null) return refused(error + (counter ? '' : ' -- a count is for a counter habit'));

  if (key === 'skip') return filed([{ name: 'habit.skip', params: { habitId, reason: field } }]);
  if (key === 'value') return filed([{ name: 'habit.set', params: { habitId, value: field } }]);
  if (field !== true) return refused('done must be true, received ' + JSON.stringify(field));
  if (!counter) return filed([{ name: 'habit.set', params: { habitId, value: true } }]);
  const target = question.target;
  if (typeof target !== 'number' || target <= 0) {
    return refused('this counter has no target that day to fill: give a count as { value }');
  }
  return filed([{ name: 'habit.set', params: { habitId, value: target } }]);
}

/**
 * @param {unknown} value
 * @returns {AnswerResult}
 */
function timeAnswer(value) {
  const { key, field, error } = oneOf(value, ['areas', 'none']);
  if (key === null) return refused(error);
  if (key === 'none') {
    return field === true ? filed([{ name: 'time.none', params: {} }]) : refused('none must be true, received ' + JSON.stringify(field));
  }
  if (typeof field !== 'object' || field === null || Array.isArray(field)) {
    return refused('areas must be minutes by area, received ' + JSON.stringify(field));
  }
  const entries = Object.entries(field);
  if (entries.length === 0) return refused('areas names no area: to declare no time, answer { none: true }');
  return filed(entries.map(([area, minutes]) => ({ name: 'time.set', params: { area, minutes } })));
}

/**
 * The action requests a closed answer files, or why it does not fit its
 * question.
 *
 * @param {import('../domain/derive/checkin.js').Question} question
 * @param {unknown} value
 * @returns {AnswerResult}
 */
export function actionsForAnswer(question, value) {
  switch (question.kind) {
    case 'habit':
      return habitAnswer(question, value);
    case 'mood':
    case 'energy': {
      const { key, field, error } = oneOf(value, ['value']);
      if (key === null) return refused(error);
      return filed([{ name: question.kind + '.set', params: { value: field } }]);
    }
    case 'time':
      return timeAnswer(value);
    case 'open': {
      const { key, field, error } = oneOf(value, ['text']);
      if (key === null) return refused(error);
      return filed([{ name: 'journal.add', params: { text: field } }]);
    }
    default:
      return refused('no closed answer for a question of kind ' + JSON.stringify(/** @type {{ kind: unknown }} */ (question).kind));
  }
}
