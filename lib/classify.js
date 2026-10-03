/**
 * Decides where a capture belongs. Model first, keyword rules underneath.
 *
 * `classify` never throws and never falls silent about which path answered:
 * `route` says `model` or `rules`, because a fallback nobody can see is
 * indistinguishable from a model that quietly stopped working. This is the
 * one gesture repeated all day, so no extended thinking, no retries -- a
 * fast answer that might be wrong beats a slow one that is merely less wrong.
 *
 * Extraction depth is not even across destinations yet. `task`, `people`,
 * `goals` and `appointment` get a real title -- all four need only a short
 * label to be a valid record (`people` files a task too), the same way
 * `title` and `name` play the same role on their entities. `appointment` additionally needs a date and a start time,
 * since without either it is not a valid record at all (see
 * `extractAppointment` below for how the rule-based path finds them). The
 * model path also estimates a `nutrition` meal: its numbers, the day it was
 * eaten and the time, each checked before use (`mealFields`) -- the rule
 * path files the meal by name only (ADR 0019). The other three destinations
 * get nothing extracted beyond the destination itself: a fabricated account,
 * amount or person name would be worse than no record at all, and `docs/domain.md` is explicit that a capture may produce
 * "nothing but a memory entry". Richer extraction arrives with each
 * destination's own card.
 */

import Anthropic from '@anthropic-ai/sdk';

import { DESTINATIONS, TASK_DESTINATIONS } from '../personalos.config.js';
import { env, hasModelAccess } from './config/env.js';
import { isDayKey, isTimeOfDay, shiftDayKey, today } from './domain/dates.js';

/**
 * @typedef {object} MealFields what the model estimated of a meal; `null`
 *   wherever it said nothing, or said something out of range
 * @property {string} title
 * @property {number | null} calories
 * @property {number | null} protein
 * @property {number | null} carbs
 * @property {number | null} fat
 * @property {string | null} date the day it was eaten, today to seven days back
 * @property {string | null} time HH:MM, only when the sentence said one
 */

/**
 * @typedef {object} Classification
 * @property {(typeof DESTINATIONS)[number]} destination
 * @property {'model' | 'rules'} route
 * @property {{ title?: string, date?: string | null, startTime?: string, endTime?: string } & Partial<MealFields>} fields
 *   what was extracted for the destination: a title, an appointment's date
 *   and times, or a meal (MealFields)
 */

/** Destinations whose minimal record needs only a short label. */
const NAMED_DESTINATIONS = [...TASK_DESTINATIONS, 'goals', 'appointment'];

/**
 * @param {string} text
 * @param {(typeof DESTINATIONS)[number]} [chosen] a destination decided
 *   before the sentence was read -- the Nutrition card's box, or Refile. The
 *   model is asked only to extract for it, and without a model the rules
 *   never get to overrule it.
 * @param {string} [saidOn] the day the sentence was said, which "domani" or
 *   "last night" is read from -- today, except when Refile reads an older
 *   capture again
 * @returns {Promise<Classification>}
 */
export async function classify(text, chosen, saidOn = today()) {
  if (hasModelAccess()) {
    try {
      const result = await classifyWithModel(text, chosen === undefined ? DESTINATIONS : [chosen], saidOn);
      return {
        destination: result.destination,
        route: 'model',
        fields: buildFields(result.destination, result, text, saidOn),
      };
    } catch (error) {
      // Never the caller's problem: a capture that hit a dead API key must
      // file exactly as well as one that never had a model to try.
      console.error('[classify] model path failed, falling back to rules:', error);
    }
  }

  if (chosen !== undefined) return { destination: chosen, route: 'rules', fields: {} };
  return classifyWithRules(text);
}

/**
 * @param {(typeof DESTINATIONS)[number]} destination
 * @param {Record<string, unknown>} extracted
 * @param {string} text
 * @param {string} saidOn
 * @returns {Classification['fields']}
 */
function buildFields(destination, extracted, text, saidOn) {
  const title = typeof extracted.title === 'string' ? extracted.title : text;
  if (destination === 'nutrition') return mealFields(extracted, title, saidOn);
  if (destination === 'appointment') {
    return {
      title,
      date: typeof extracted.date === 'string' ? extracted.date : undefined,
      startTime: typeof extracted.startTime === 'string' ? extracted.startTime : undefined,
      endTime: typeof extracted.endTime === 'string' ? extracted.endTime : undefined,
    };
  }
  if (NAMED_DESTINATIONS.includes(/** @type {any} */ (destination))) {
    return { title };
  }
  return {};
}

/**
 * The most a single meal may claim: 5,000 kcal, and for each macro the grams
 * that alone would make 5,000 kcal at 4/4/9. A number past its bound is the
 * model misreading the sentence, not a feast.
 */
const MEAL_BOUNDS = Object.freeze({ calories: 5000, protein: 1250, carbs: 1250, fat: 555 });

/** How far back a meal may be placed: "last Sunday" works, "in June" does not. */
const MEAL_DAYS_BACK = 7;

/**
 * The model's meal, checked before anything is filed. Anything missing or out
 * of range becomes `null` -- unknown, never zero, never the capture failing
 * (ADR 0019).
 *
 * @param {Record<string, unknown>} extracted
 * @param {string} title
 * @param {string} saidOn the day the placement window ends on
 * @returns {MealFields}
 */
function mealFields(extracted, title, saidOn) {
  /** @param {keyof typeof MEAL_BOUNDS} key */
  const count = (key) => {
    const value = extracted[key];
    return Number.isInteger(value) && /** @type {number} */ (value) >= 0 && /** @type {number} */ (value) <= MEAL_BOUNDS[key]
      ? /** @type {number} */ (value)
      : null;
  };
  const date = extracted.date;
  const time = extracted.time;
  return {
    title,
    calories: count('calories'),
    protein: count('protein'),
    carbs: count('carbs'),
    fat: count('fat'),
    date: isDayKey(date) && /** @type {string} */ (date) <= saidOn && /** @type {string} */ (date) >= shiftDayKey(saidOn, -MEAL_DAYS_BACK)
      ? /** @type {string} */ (date)
      : null,
    time: isTimeOfDay(time) ? /** @type {string} */ (time) : null,
  };
}

/**
 * @param {readonly string[]} destinations the ones the model may choose from
 * @returns {any} the SDK's tool schema type is stricter than JSDoc can express here
 */
const fileCaptureTool = (destinations) => ({
  name: 'file_capture',
  description:
    'Decide which destination this capture belongs to, a short title for a task (including ' +
    'one owed to a person), goal, appointment or meal, the date/time for an appointment, and ' +
    'for a meal an estimate of what was eaten and when.',
  input_schema: {
    type: 'object',
    properties: {
      destination: { type: 'string', enum: destinations },
      title: {
        type: 'string',
        description:
          'A short title. Only meaningful when destination is "task", "people", "goals", ' +
          '"appointment" or "nutrition" (the name of the meal, e.g. "Carbonara").',
      },
      date: {
        type: 'string',
        description:
          'YYYY-MM-DD, resolved against the current date given in this conversation\'s system ' +
          'prompt. For "appointment": only when the text states or implies an explicit date (a ' +
          'weekday name, "domani", "dopodomani", ...). For "nutrition": the day the meal was ' +
          'eaten, only when the text places it on an earlier day ("last night", "ieri sera").',
      },
      time: {
        type: 'string',
        description: 'HH:MM, 24-hour. Only when destination is "nutrition" and the text says when the meal was eaten.',
      },
      calories: { type: 'integer', description: 'Only for "nutrition": estimated kcal of the whole meal.' },
      protein: { type: 'integer', description: 'Only for "nutrition": estimated grams of protein.' },
      carbs: { type: 'integer', description: 'Only for "nutrition": estimated grams of carbohydrate.' },
      fat: { type: 'integer', description: 'Only for "nutrition": estimated grams of fat.' },
      startTime: {
        type: 'string',
        description: 'HH:MM, 24-hour. Only when destination is "appointment" and an explicit time is stated.',
      },
      endTime: {
        type: 'string',
        description: 'HH:MM, 24-hour. Only when an explicit end time is stated.',
      },
    },
    required: ['destination'],
  },
});

/**
 * @param {string} text
 * @param {readonly string[]} destinations
 * @param {string} saidOn
 * @returns {Promise<{ destination: (typeof DESTINATIONS)[number] } & Record<string, unknown>>}
 */
async function classifyWithModel(text, destinations, saidOn) {
  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const response = await client.messages.create({
    model: env.anthropicModel,
    max_tokens: 200,
    // Resolving "giovedì" or "domani" needs a reference point the model has
    // no other way to know -- it has no wall clock.
    system: 'Today is ' + saidOn + '.',
    tools: [fileCaptureTool(destinations)],
    tool_choice: { type: 'tool', name: 'file_capture' },
    messages: [{ role: 'user', content: text }],
  });

  const toolUse = /** @type {any} */ (response).content.find(
    (/** @type {{ type: string }} */ block) => block.type === 'tool_use'
  );
  if (!toolUse) throw new Error('model did not return a classification');

  // Every field but the destination is checked where it is used
  // (buildFields): the model's output is untrusted until then.
  const input = /** @type {Record<string, unknown>} */ (toolUse.input);
  if (!destinations.includes(/** @type {any} */ (input.destination))) {
    throw new Error('model chose a destination outside the closed vocabulary: ' + String(input.destination));
  }

  return { ...input, destination: /** @type {(typeof DESTINATIONS)[number]} */ (input.destination) };
}

/**
 * A small keyword table, good enough to be right most of the time -- not
 * exhaustive, and not trying to be. Checked in order; the first match wins.
 *
 * `people` and `memory` have no rule and are only reachable through the
 * model: a keyword heuristic for "this is about a person" kept catching
 * "call Marta about the quote", which is a task, not a CRM note, and no
 * pattern distinguishes an observation worth remembering (memory) from an
 * imperative worth doing (task) either. Unmatched text becomes a task,
 * since that is what most quick captures are -- wrong sometimes, same as
 * any rule-based fallback, and the model is there for the cases this isn't.
 *
 * @param {string} text
 * @returns {Classification}
 */
export function classifyWithRules(text) {
  const appointment = extractAppointment(text);
  if (appointment !== null) {
    return { destination: 'appointment', route: 'rules', fields: { title: text, ...appointment } };
  }

  for (const { destination, pattern } of RULE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        destination,
        route: 'rules',
        fields: NAMED_DESTINATIONS.includes(/** @type {any} */ (destination)) ? { title: text } : {},
      };
    }
  }
  return { destination: 'task', route: 'rules', fields: { title: text } };
}

/**
 * The offline appointment detector: Italian only (ADR: this app has one
 * user, who captures in Italian; the model, when available, already handles
 * any language). Deliberately narrow -- an explicit weekday/relative-day
 * word plus an "alle" time, nothing cleverer. Returns null the moment either
 * signal is missing, which is what keeps every other rule's behaviour
 * (finance, nutrition, ..., the task fallback) exactly as it was: this only
 * intercepts a capture when the ticket's "explicit date and time" condition
 * is actually met.
 *
 * ponytail: no absolute dates ("12/9"), no "ore 15" without "alle", no
 * "pomeriggio"/"mattina" parts of day -- add them if the offline path
 * (no ANTHROPIC_API_KEY) turns out to matter for how you actually capture.
 *
 * @param {string} text
 * @returns {{ date: string, startTime: string } | null}
 */
function extractAppointment(text) {
  const timeMatch = text.match(/\balle\s+(\d{1,2})(?:[:.](\d{2}))?\b/i);
  if (!timeMatch) return null;
  const hour = Number(timeMatch[1]);
  const minute = timeMatch[2] ? Number(timeMatch[2]) : 0;
  if (hour > 23 || minute > 59) return null;

  const date = resolveItalianDate(text);
  if (date === null) return null;

  return { date, startTime: String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0') };
}

/** Sunday-first, matching `Date#getUTCDay()`. */
const ITALIAN_WEEKDAYS = {
  domenica: 0,
  lunedi: 1,
  'lunedì': 1,
  martedi: 2,
  'martedì': 2,
  mercoledi: 3,
  'mercoledì': 3,
  giovedi: 4,
  'giovedì': 4,
  venerdi: 5,
  'venerdì': 5,
  sabato: 6,
};

/**
 * @param {string} text
 * @returns {string | null} a day key, or null when the text names no date
 */
function resolveItalianDate(text) {
  const lower = text.toLowerCase();
  if (/\bdopodomani\b/.test(lower)) return shiftDayKey(today(), 2);
  if (/\bdomani\b/.test(lower)) return shiftDayKey(today(), 1);
  if (/\boggi\b/.test(lower)) return today();

  // Not \b on the trailing side: JS regex treats accented letters like "ì" as
  // non-word characters, so \b after "gioved[iì]" fails to match when the
  // day name is itself the last word char before whitespace.
  const weekdayMatch = lower.match(
    /(?<![a-zà-ù])(domenica|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato)(?![a-zà-ù])/
  );
  if (!weekdayMatch) return null;

  const todayKey = today();
  const todayIndex = new Date(todayKey + 'T00:00:00Z').getUTCDay();
  const targetIndex = ITALIAN_WEEKDAYS[/** @type {keyof typeof ITALIAN_WEEKDAYS} */ (weekdayMatch[1])];
  // The nearest occurrence on or after today -- "giovedì" said on a Thursday
  // means today, not a week from now.
  return shiftDayKey(todayKey, (targetIndex - todayIndex + 7) % 7);
}

const RULE_PATTERNS = /** @type {const} */ ([
  // "invoice" and "cost" alone are too weak: "call about the invoice" is a
  // task, not a transaction. Kept to words that only make sense once money
  // has actually moved.
  { destination: 'finance', pattern: /\b(paid|spent|bought|refund(ed)?)\b|[€$]\s?\d/i },
  { destination: 'nutrition', pattern: /\b(ate|breakfast|lunch|dinner|snack)\b/i },
  { destination: 'health', pattern: /\b(weigh(ed|t)?|kg|workout|gym|slept|steps|ran \d)\b/i },
  { destination: 'goals', pattern: /\b(goal|promise to|aiming to)\b/i },
  // No `people` rule: "call Marta about the quote" is a task that involves a
  // person, not a note filed under people -- a keyword can't tell those
  // apart, and guessing wrong here is worse than leaving it to the model.
]);
