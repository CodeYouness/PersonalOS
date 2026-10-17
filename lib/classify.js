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
 * path files the meal by name only (ADR 0019). `health` gets a weight: read
 * by the model with the day it was taken, or with no model read off the
 * sentence in kg (`weightFields`), each checked before use (ADR 0020).
 * `finance` gets an amount: read by the model with its direction, the
 * account the sentence names and one of your categories, or with no model
 * read off the sentence as spending (`financeFields`) -- each checked before
 * use, and a category or an account the model invents is dropped (ADR 0026).
 * `memory` gets nothing extracted beyond the destination itself: a
 * fabricated person would be worse than no record at all, and
 * `docs/domain.md` is explicit that a capture may produce "nothing but a
 * memory entry".
 */

import Anthropic from '@anthropic-ai/sdk';

import { DESTINATIONS, TASK_DESTINATIONS, limits } from '../personalos.config.js';
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
 * @typedef {object} WeightFields a weight the sentence named, checked
 * @property {number | null} weight kg, within WEIGHT_BOUNDS; null when the
 *   sentence names none or names one nobody weighs
 * @property {string | null} [date] the day it was taken, when not the day
 *   it was said
 */

/**
 * @typedef {object} FinanceFields money the sentence names, checked (ADR 0026)
 * @property {number | null} amount minor units, positive; null when the
 *   sentence names no amount to believe
 * @property {'out' | 'in'} direction spending, unless the model read income
 *   or a refund
 * @property {string | null} [account] the account as the model read it from
 *   the sentence, or null when it read none; absent when no model read it,
 *   and then the sentence itself is matched against your accounts
 * @property {string | null} categoryId one of the categories it was offered
 * @property {string | null} [date] the day it moved, when not the day it was said
 */

/**
 * What the classifier is told about your finances, so the model can choose
 * among what exists and never invent: your categories.
 *
 * @typedef {object} ClassifyContext
 * @property {{ id: string, name: string }[]} [categories] the ones a
 *   movement may be filed on, named as the screen names them
 */

/**
 * @typedef {object} Classification
 * @property {(typeof DESTINATIONS)[number]} destination
 * @property {'model' | 'rules'} route
 * @property {{ title?: string, date?: string | null, startTime?: string, endTime?: string } & Partial<MealFields> & Partial<WeightFields> & Partial<FinanceFields>} fields
 *   what was extracted for the destination: a title, an appointment's date
 *   and times, a meal (MealFields), a weight (WeightFields) or money
 *   (FinanceFields)
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
 * @param {ClassifyContext} [context] your categories, for a finance sentence
 * @returns {Promise<Classification>}
 */
export async function classify(text, chosen, saidOn = today(), context = {}) {
  if (hasModelAccess()) {
    try {
      const { classification } = await classifyWithModel(text, {
        model: env.models.classify,
        saidOn,
        context,
        destinations: chosen === undefined ? DESTINATIONS : [chosen],
      });
      return classification;
    } catch (error) {
      // Never the caller's problem: a capture that hit a dead API key must
      // file exactly as well as one that never had a model to try.
      console.error('[classify] model path failed, falling back to rules:', error);
    }
  }

  if (chosen !== undefined) {
    return { destination: chosen, route: 'rules', fields: chosen === 'health' || chosen === 'finance' ? rulesFields(chosen, text) : {} };
  }
  return classifyWithRules(text);
}

/**
 * @param {(typeof DESTINATIONS)[number]} destination
 * @param {Record<string, unknown>} extracted
 * @param {string} text
 * @param {string} saidOn
 * @param {ClassifyContext} context
 * @returns {Classification['fields']}
 */
function buildFields(destination, extracted, text, saidOn, context) {
  const title = typeof extracted.title === 'string' ? extracted.title : text;
  if (destination === 'nutrition') return mealFields(extracted, title, saidOn);
  if (destination === 'health') return modelWeightFields(extracted, saidOn);
  if (destination === 'finance') return { title, ...modelFinanceFields(extracted, saidOn, context) };
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

/** How far back a meal, a weight or money may be placed: "last Sunday" works, "in June" does not. */
const PLACED_DAYS_BACK = 7;

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
  const time = extracted.time;
  return {
    title,
    calories: count('calories'),
    protein: count('protein'),
    carbs: count('carbs'),
    fat: count('fat'),
    date: placedDay(extracted.date, saidOn),
    time: isTimeOfDay(time) ? /** @type {string} */ (time) : null,
  };
}

/**
 * The day the model placed a meal, a weight or money on, if it is one the record may
 * go on: the day it was said or up to a week before. Anything else is unknown,
 * and the record goes on the day it was said.
 *
 * @param {unknown} date
 * @param {string} saidOn
 * @returns {string | null}
 */
function placedDay(date, saidOn) {
  return isDayKey(date) && /** @type {string} */ (date) <= saidOn && /** @type {string} */ (date) >= shiftDayKey(saidOn, -PLACED_DAYS_BACK)
    ? /** @type {string} */ (date)
    : null;
}

/** The only weights believed: anything outside is a misreading (ADR 0020). */
const WEIGHT_BOUNDS = Object.freeze({ min: 20, max: 300 });

/**
 * @param {unknown} kg
 * @returns {number | null} the weight, if it is one anybody weighs
 */
function believedWeight(kg) {
  return typeof kg === 'number' && kg >= WEIGHT_BOUNDS.min && kg <= WEIGHT_BOUNDS.max ? kg : null;
}

/**
 * A weight read off the sentence: a number followed by "kg" -- "74.6 kg",
 * "74,6kg", "74 kg" -- in any language, since the unit is the signal. Out of
 * WEIGHT_BOUNDS it is dropped, never believed: the sentence is still kept
 * as a capture and a memory.
 *
 * ponytail: kg only, no "chili"/"pounds" -- add when a sentence that matters
 * is missed.
 *
 * @param {string} text
 * @returns {WeightFields}
 */
export function weightFields(text) {
  // Not preceded by a digit or separator: "1074 kg" is not "74 kg".
  const match = text.match(/(?<![\d.,])(\d{1,3}(?:[.,]\d{1,2})?)\s?kg\b/i);
  return { weight: match ? believedWeight(Number(match[1].replace(',', '.'))) : null };
}

/**
 * The model's weight, checked like the rule's: within WEIGHT_BOUNDS or not at
 * all. Once the model has read the sentence, the rule does not overrule it:
 * "benched 100kg" names kilos that are not a body weight, and the model is
 * what tells them apart. The rule is for when there is no model.
 *
 * @param {Record<string, unknown>} extracted
 * @param {string} saidOn
 * @returns {WeightFields}
 */
function modelWeightFields(extracted, saidOn) {
  return { weight: believedWeight(extracted.weight), date: placedDay(extracted.date, saidOn) };
}

/** The most a single captured movement may claim: a misreading past it is dropped. */
const MAX_CAPTURED_MINOR_UNITS = 100_000_000_00;

/**
 * Euros as the model gave them, to minor units -- rounded half up on the
 * decimal digits, never on the float -- or null when it is not a positive
 * amount anybody spends in one sentence.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
function believedAmount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const [whole, fraction = ''] = value.toFixed(6).split('.');
  const minor = Number(whole) * 100 + Number(fraction.slice(0, 2)) + (fraction[2] >= '5' ? 1 : 0);
  return minor > 0 && minor <= MAX_CAPTURED_MINOR_UNITS ? minor : null;
}

/**
 * Money read off the sentence with no model (ADR 0026): an amount next to a
 * euro sign or the word -- "€ 18,40", "18,40€", "18.40 €", "18,40 euro",
 * "€1.234,50" -- read as spending. No direction, account or category is
 * guessed: those are the model's to read, or the default account's.
 *
 * ponytail: euro only, no "18,40" without a currency -- "spent 20 on coffee"
 * stays a capture; add a bare-number rule if that turns out to matter.
 *
 * @param {string} text
 * @returns {FinanceFields}
 */
export function financeFields(text) {
  // A thousands group never follows a leading 0: "0.004" is no amount. A
  // space never groups thousands: "il 3 100€" is 100, not 3,100.
  const number = '([1-9]\\d{0,2}(?:\\.\\d{3})+(?:,\\d{1,2})?|[1-9]\\d{0,2}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
  // Both shapes, "€ 18,40" and "18,40 €", and the first amount in the
  // sentence wins: "18,40€ di cui €2 mancia" is 18,40.
  const found = [
    ...text.matchAll(new RegExp('€\\s?' + number + '(?![\\d.,])', 'g')),
    ...text.matchAll(new RegExp('(?<![\\d.,])' + number + '\\s?(?:€|euros?\\b|eur\\b)', 'gi')),
  ].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return { amount: found.length > 0 ? parseEuros(found[0][1]) : null, direction: 'out', categoryId: null };
}

/**
 * A written amount of euros to minor units, whichever separator it uses for
 * decimals: the last "," or "." followed by one or two digits is the
 * decimal point, every other separator groups thousands.
 *
 * @param {string} written
 * @returns {number | null}
 */
function parseEuros(written) {
  const decimal = written.match(/[.,](\d{1,2})$/);
  const whole = (decimal ? written.slice(0, -decimal[0].length) : written).replace(/[.,]/g, '');
  const minor = Number(whole) * 100 + Number((decimal?.[1] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor > 0 && minor <= MAX_CAPTURED_MINOR_UNITS ? minor : null;
}

/**
 * The model's money, checked like everything else it says: an amount within
 * bounds, a direction, the account as said, and a category only when it is
 * one it was offered -- an invented one is dropped, so the movement lands
 * on the Uncategorised line instead.
 *
 * @param {Record<string, unknown>} extracted
 * @param {string} saidOn
 * @param {ClassifyContext} context
 * @returns {FinanceFields}
 */
function modelFinanceFields(extracted, saidOn, context) {
  const offered = new Set((context.categories ?? []).map((category) => category.id));
  return {
    amount: believedAmount(extracted.amount),
    direction: extracted.direction === 'in' ? 'in' : 'out',
    account: typeof extracted.account === 'string' && extracted.account.trim() !== '' ? extracted.account.trim() : null,
    categoryId: typeof extracted.categoryId === 'string' && offered.has(extracted.categoryId) ? extracted.categoryId : null,
    date: placedDay(extracted.date, saidOn),
  };
}

/**
 * What each destination means, told to the model with the destination
 * itself. Its names alone read wrong: `people` sounds like "about a
 * person", and a model filed facts about someone there (#203). Each line
 * agrees with the table under Capture in docs/domain.md.
 *
 * @type {Readonly<Record<(typeof DESTINATIONS)[number], string>>}
 */
const DESTINATION_MEANINGS = Object.freeze({
  task: 'something to do -- not a thing at a set day and time',
  people: 'something to do that is owed to, or involves, a person the sentence names -- a fact about a person is memory',
  finance: 'money that moved: spent, paid, received, refunded',
  nutrition: 'something eaten or drunk',
  health: 'your body: your weight on a scale, training done (kilos lifted are not your weight), sleep, a symptom',
  goals: 'a promise to yourself, something you mean to achieve -- not something already done',
  memory: 'something worth knowing and nothing to do: a fact, a preference, a decision, about you, a person or a place',
  appointment: 'a thing happening at a stated day and time -- a deadline with no time is a task',
});

/**
 * @param {readonly string[]} destinations the ones the model may choose from
 * @param {ClassifyContext} [context]
 * @returns {any} the SDK's tool schema type is stricter than JSDoc can express here
 */
const fileCaptureTool = (destinations, context = {}) => ({
  name: 'file_capture',
  description:
    'Decide which destination this capture belongs to, a short title for a task (including ' +
    'one owed to a person), goal, appointment or meal, the date/time for an appointment, ' +
    'for a meal an estimate of what was eaten and when, for health a body weight said, and ' +
    'for finance the money that moved.',
  input_schema: {
    type: 'object',
    properties: {
      destination: {
        type: 'string',
        enum: destinations,
        description: destinations
          .map((destination) => destination + ' = ' + DESTINATION_MEANINGS[/** @type {(typeof DESTINATIONS)[number]} */ (destination)])
          .join('; '),
      },
      title: {
        type: 'string',
        description:
          'A short title. Only meaningful when destination is "task", "people", "goals", ' +
          '"appointment", "nutrition" (the name of the meal, e.g. "Carbonara") or "finance" ' +
          '(what the money was for, e.g. "Supermarket").',
      },
      date: {
        type: 'string',
        description:
          'YYYY-MM-DD, resolved against the current date given in this conversation\'s system ' +
          'prompt. For "appointment": only when the text states or implies an explicit date (a ' +
          'weekday name, "domani", "dopodomani", ...). For "nutrition": the day the meal was ' +
          'eaten, only when the text places it on an earlier day ("last night", "ieri sera"). ' +
          'For "health": the day the weight was taken, only when the text places it on an earlier day. ' +
          'For "finance": the day the money moved, only when the text places it on an earlier day.',
      },
      time: {
        type: 'string',
        description: 'HH:MM, 24-hour. Only when destination is "nutrition" and the text says when the meal was eaten.',
      },
      calories: { type: 'integer', description: 'Only for "nutrition": estimated kcal of the whole meal.' },
      protein: { type: 'integer', description: 'Only for "nutrition": estimated grams of protein.' },
      carbs: { type: 'integer', description: 'Only for "nutrition": estimated grams of carbohydrate.' },
      fat: { type: 'integer', description: 'Only for "nutrition": estimated grams of fat.' },
      weight: {
        type: 'number',
        description:
          'Only for "health": your own body weight as the text states it, in kg -- never a weight lifted, ' +
          'carried or of anything else. Never estimated -- omit it when no body weight is said.',
      },
      amount: {
        type: 'number',
        description: 'Only for "finance": the amount of money the text states, in euros, positive. Never estimated -- omit it when no amount is said.',
      },
      direction: {
        type: 'string',
        enum: ['out', 'in'],
        description: 'Only for "finance": "in" when money came in -- income, a refund, money given back -- else "out".',
      },
      account: {
        type: 'string',
        description: 'Only for "finance": the account or card the text names, as written. Omit it when none is named.',
      },
      ...((context.categories ?? []).length > 0
        ? {
            categoryId: {
              type: 'string',
              enum: (context.categories ?? []).map((category) => category.id),
              description:
                'Only for "finance": the id of the category it belongs to, from this list -- ' +
                (context.categories ?? []).map((category) => category.id + ' = ' + category.name).join('; ') +
                '. Omit it when none fits.',
            },
          }
        : {}),
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
 * Files a sentence on the model it is given, and says what that cost in
 * tokens. Unlike `classify`, it throws on any failure and never falls back
 * to the rules: `npm run eval:classify` calls it to score a model, and a
 * fallback would hide a model that does not work (#197). The fields are
 * checked exactly as they are before filing.
 *
 * @param {string} text
 * @param {object} options
 * @param {string} options.model
 * @param {string} options.saidOn the day "domani" or "last night" is read from
 * @param {ClassifyContext} [options.context]
 * @param {readonly (typeof DESTINATIONS)[number][]} [options.destinations] the
 *   ones the model may choose from; all of them unless one was chosen up front
 * @returns {Promise<{ classification: Classification, usage: { inputTokens: number, outputTokens: number } | null }>}
 *   usage is null when the reply carried none -- unknown, not free
 */
export async function classifyWithModel(text, { model, saidOn, context = {}, destinations = DESTINATIONS }) {
  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const response = await client.messages.create({
    model,
    max_tokens: limits.classifyMaxTokens,
    // Resolving "giovedì" or "domani" needs a reference point the model has
    // no other way to know -- it has no wall clock.
    system: 'Today is ' + saidOn + '.',
    tools: [fileCaptureTool(destinations, context)],
    tool_choice: { type: 'tool', name: 'file_capture' },
    messages: [{ role: 'user', content: text }],
  });

  // A reply cut off at the ceiling holds a tool call short of its fields --
  // a meal with no fat, money with no category -- which would file as if
  // the model had said nothing more.
  if (/** @type {any} */ (response).stop_reason === 'max_tokens') {
    throw new Error('the classification was cut off at max_tokens');
  }

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
  const destination = /** @type {(typeof DESTINATIONS)[number]} */ (input.destination);

  const usage = /** @type {any} */ (response).usage;
  return {
    classification: { destination, route: 'model', fields: buildFields(destination, input, text, saidOn, context) },
    usage:
      typeof usage?.input_tokens === 'number' && typeof usage?.output_tokens === 'number'
        ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens }
        : null,
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
        fields: rulesFields(destination, text),
      };
    }
  }
  return { destination: 'task', route: 'rules', fields: { title: text } };
}

/**
 * What the rules read for a destination, with no model: a weight, an
 * amount, or for a named destination the sentence as its title.
 *
 * @param {(typeof DESTINATIONS)[number]} destination
 * @param {string} text
 * @returns {Classification['fields']}
 */
function rulesFields(destination, text) {
  if (destination === 'health') return weightFields(text);
  if (destination === 'finance') return financeFields(text);
  return NAMED_DESTINATIONS.includes(/** @type {any} */ (destination)) ? { title: text } : {};
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
  // "\dkg" too: "74kg" has no word boundary before the k.
  { destination: 'health', pattern: /\b(weigh(ed|t)?|kg|workout|gym|slept|steps|ran \d)\b|\d\s?kg\b/i },
  { destination: 'goals', pattern: /\b(goal|promise to|aiming to)\b/i },
  // No `people` rule: "call Marta about the quote" is a task that involves a
  // person, not a note filed under people -- a keyword can't tell those
  // apart, and guessing wrong here is worse than leaving it to the model.
]);
