/**
 * Product configuration for PersonalOS.
 *
 * Everything a person cloning this template may reasonably want to change
 * lives here. Secrets never do: those come from the environment and are read
 * in exactly one place, lib/config/env.js.
 *
 * Personal content -- your name, your habits, your calorie target -- is not
 * configuration in this sense. It lives in the profile, inside the data file,
 * so that changing it never means editing code.
 */

/**
 * The capture destinations. This array is the single source of truth: the
 * classifier is validated against it and a destination the model invents is
 * rejected rather than written. Change them here and nowhere else.
 *
 * @type {readonly string[]}
 */
export const DESTINATIONS = Object.freeze([
  'task',
  'people',
  'finance',
  'nutrition',
  'health',
  'goals',
  'memory',
]);

/**
 * Urgency bands, most urgent first. Deliberately bands and not due dates:
 * dated lists rot, because everything slips and rescheduling becomes a second
 * job. `overdue` is never an input value -- a task is moved there by time
 * passing, never assigned there on creation.
 *
 * @type {readonly string[]}
 */
export const URGENCY_BANDS = Object.freeze(['overdue', 'today', 'week', 'later']);

/** How much a task is burning. Used as the second sort key after the band. */
export const TEMPERATURES = Object.freeze(['hot', 'warm', 'cold']);

/** A habit is either done/not done, or counted against a target. */
export const HABIT_TYPES = Object.freeze(['check', 'counter']);

/** How a finance category is classified when the spreadsheet is extracted. */
export const ACCOUNT_TYPES = Object.freeze(['cash', 'invested', 'debt']);

/**
 * Numbers that are decisions, not accidents. Each one is a product choice
 * explained in docs/domain.md; none of them belongs inline in a component.
 */
export const limits = Object.freeze({
  /** Three is a decision, ten is a list. Shown by the Session card. */
  sessionTaskCount: 3,
  /** How far back the Health card aggregates. */
  healthWindowDays: 30,
  /** How far ahead recurring calendar events are expanded. */
  calendarWindowDays: 14,
  /** Server-side cache for the parsed iCal feed. */
  calendarCacheMs: 5 * 60 * 1000,
  /** Nearest memory entries passed to the model when answering a question. */
  memorySearchResults: 20,
  /** Classification is a short structured answer; it needs no room to think. */
  classifyMaxTokens: 512,
  /**
   * Answers need headroom: the model emits reasoning blocks before the text,
   * and a low ceiling makes the endpoint return an empty string that looks
   * like a bug. See docs/decisions and the guide, Part 8.
   */
  answerMaxTokens: 3000,
});

/**
 * Capabilities that exist only on the guide's "Percorso Completo". They are
 * flags rather than deleted code so that the local path stays honest about
 * what it is not doing yet.
 */
export const features = Object.freeze({
  telegramCapture: false,
  semanticMemory: false,
  morningBriefing: false,
});

/**
 * Dashboard composition. Filled in when the screens are ported from the
 * mockup. It lives here so the layout stays configuration instead of a
 * hard-coded component tree.
 *
 * @type {{ screens: readonly string[] }}
 */
export const dashboard = Object.freeze({ screens: [] });

/**
 * Fallback model name, used only when ANTHROPIC_MODEL is unset. Model names
 * change; the variable is the real control. See docs/development.md.
 */
export const defaultModel = 'claude-sonnet-4-5';

/** Fallback timezone, used only when USER_TIMEZONE is unset. */
export const defaultTimezone = 'Europe/Rome';
