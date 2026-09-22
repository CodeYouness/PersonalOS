/**
 * Decides where a capture belongs. Model first, keyword rules underneath.
 *
 * `classify` never throws and never falls silent about which path answered:
 * `route` says `model` or `rules`, because a fallback nobody can see is
 * indistinguishable from a model that quietly stopped working. This is the
 * one gesture repeated all day, so no extended thinking, no retries -- a
 * fast answer that might be wrong beats a slow one that is merely less wrong.
 *
 * Extraction depth is not even across destinations yet. `task`, `goals` and
 * `appointment` get a real title -- all three need only a short label to be
 * a valid record, the same way `title` and `name` play the same role on
 * their entities. `appointment` additionally needs a date and a start time,
 * since without either it is not a valid record at all (see
 * `extractAppointment` below for how the rule-based path finds them). The
 * other four destinations get nothing extracted beyond the destination
 * itself: a fabricated account, amount or person name would be worse than no
 * record at all, and `docs/domain.md` is explicit that a capture may produce
 * "nothing but a memory entry". Richer extraction arrives with each
 * destination's own card.
 */

import Anthropic from '@anthropic-ai/sdk';

import { DESTINATIONS } from '../personalos.config.js';
import { env, hasModelAccess } from './config/env.js';
import { shiftDayKey, today } from './domain/dates.js';

/**
 * @typedef {object} Classification
 * @property {(typeof DESTINATIONS)[number]} destination
 * @property {'model' | 'rules'} route
 * @property {{ title?: string, date?: string, startTime?: string, endTime?: string }} fields
 */

/** Destinations whose minimal record needs only a short label. */
const NAMED_DESTINATIONS = /** @type {const} */ (['task', 'goals', 'appointment']);

/**
 * @param {string} text
 * @returns {Promise<Classification>}
 */
export async function classify(text) {
  if (hasModelAccess()) {
    try {
      const result = await classifyWithModel(text);
      return {
        destination: result.destination,
        route: 'model',
        fields: buildFields(result.destination, result, text),
      };
    } catch (error) {
      // Never the caller's problem: a capture that hit a dead API key must
      // file exactly as well as one that never had a model to try.
      console.error('[classify] model path failed, falling back to rules:', error);
    }
  }

  return classifyWithRules(text);
}

/**
 * @param {(typeof DESTINATIONS)[number]} destination
 * @param {{ title?: string, date?: string, startTime?: string, endTime?: string }} extracted
 * @param {string} text
 * @returns {Classification['fields']}
 */
function buildFields(destination, extracted, text) {
  if (destination === 'appointment') {
    return {
      title: extracted.title ?? text,
      date: extracted.date,
      startTime: extracted.startTime,
      endTime: extracted.endTime,
    };
  }
  if (NAMED_DESTINATIONS.includes(/** @type {any} */ (destination))) {
    return { title: extracted.title ?? text };
  }
  return {};
}

/** @type {any} the SDK's tool schema type is stricter than JSDoc can express here */
const FILE_CAPTURE_TOOL = {
  name: 'file_capture',
  description:
    'Decide which destination this capture belongs to, a short title for a task, goal or ' +
    'appointment, and the date/time for an appointment.',
  input_schema: {
    type: 'object',
    properties: {
      destination: { type: 'string', enum: DESTINATIONS },
      title: {
        type: 'string',
        description: 'A short title. Only meaningful when destination is "task", "goals" or "appointment".',
      },
      date: {
        type: 'string',
        description:
          'YYYY-MM-DD. Only when destination is "appointment" and the text states or implies an ' +
          'explicit date (a weekday name, "domani", "dopodomani", ...), resolved against the ' +
          "current date given in this conversation's system prompt.",
      },
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
};

/**
 * @param {string} text
 * @returns {Promise<{ destination: (typeof DESTINATIONS)[number], title?: string, date?: string, startTime?: string, endTime?: string }>}
 */
async function classifyWithModel(text) {
  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const response = await client.messages.create({
    model: env.anthropicModel,
    max_tokens: 200,
    // Resolving "giovedì" or "domani" needs a reference point the model has
    // no other way to know -- it has no wall clock.
    system: 'Today is ' + today() + '.',
    tools: [FILE_CAPTURE_TOOL],
    tool_choice: { type: 'tool', name: 'file_capture' },
    messages: [{ role: 'user', content: text }],
  });

  const toolUse = /** @type {any} */ (response).content.find(
    (/** @type {{ type: string }} */ block) => block.type === 'tool_use'
  );
  if (!toolUse) throw new Error('model did not return a classification');

  const input = /** @type {{ destination?: unknown, title?: unknown, date?: unknown, startTime?: unknown, endTime?: unknown }} */ (
    toolUse.input
  );
  if (!DESTINATIONS.includes(/** @type {any} */ (input.destination))) {
    throw new Error('model chose a destination outside the closed vocabulary: ' + String(input.destination));
  }

  return {
    destination: /** @type {(typeof DESTINATIONS)[number]} */ (input.destination),
    title: typeof input.title === 'string' ? input.title : undefined,
    date: typeof input.date === 'string' ? input.date : undefined,
    startTime: typeof input.startTime === 'string' ? input.startTime : undefined,
    endTime: typeof input.endTime === 'string' ? input.endTime : undefined,
  };
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
