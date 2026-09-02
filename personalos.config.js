/**
 * Product configuration for PersonalOS.
 *
 * Everything a person cloning this template may reasonably want to change
 * lives here. Secrets never do: those come from the environment and are read
 * in exactly one place, lib/config/env.js.
 *
 * Personal content -- your name, your habits, your finance categories -- is
 * not configuration in this sense. It lives in the profile, inside the data
 * file, so that changing it never means editing code.
 *
 * The frozen arrays below are closed vocabularies. They are what keeps a
 * graph of loosely related things from rotting into free-form strings: if a
 * value is not in the list, it is rejected at the store boundary rather than
 * written and discovered months later.
 */

/**
 * Every kind of entity that can be referenced. An id carries its type as a
 * prefix (`task_...`), so a reference is a self-describing string and there
 * is no need for a {type, id} pair anywhere. See lib/domain/refs.js.
 *
 * @type {readonly string[]}
 */
export const ENTITY_TYPES = Object.freeze([
  'task',
  'person',
  'goal',
  'habit',
  'capture',
  'memory',
  'journal',
  'event',
  'link',
  'meal',
  'measurement',
  'account',
  'observation',
  'transaction',
  'snapshot',
]);

/**
 * The capture destinations. Single source of truth: the classifier is
 * validated against this list, and a destination the model invents is
 * rejected rather than producing an orphan record.
 *
 * Journal is deliberately absent. Writing a diary is not a capture that got
 * filed somewhere -- it is its own thing, with its own entity.
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
 * Relationship vocabulary for the link collection.
 *
 * Closed on purpose. An open vocabulary would make links unqueryable within a
 * year, because nobody would remember whether it was "belongs_to",
 * "belongsTo" or "parent". Add one here, document it in docs/domain.md, and
 * only then use it.
 *
 * @type {readonly string[]}
 */
export const LINK_RELS = Object.freeze([
  /** child to parent: task -> goal, goal -> goal, habit -> goal */
  'belongs_to',
  /** a person takes part in it: task -> person, event -> person */
  'involves',
  /** loose subject matter: memory -> anything, journal -> anything */
  'about',
  /** provenance: memory -> journal | capture, task -> capture */
  'derived_from',
  /** money aimed at something: transaction -> goal */
  'funds',
]);

/**
 * What kind of claim a memory entry is making. The distinction matters
 * because these age differently: a fact can be corrected, a preference can
 * change, a decision stays true even once it is no longer in force.
 *
 * @type {readonly string[]}
 */
export const MEMORY_TYPES = Object.freeze([
  'fact',
  'preference',
  'decision',
  'context',
  'observation',
  'event',
]);

/**
 * Where a record came from. Present on every canonical entity, because "who
 * created this" is the question you ask first when something looks wrong.
 *
 * @type {readonly string[]}
 */
export const SOURCE_KINDS = Object.freeze([
  'user',
  'capture',
  'journal',
  'integration',
  'derived',
  'seed',
]);

/**
 * Timeline vocabulary. Events are append-only and never the truth about
 * state: they point at the canonical entity.
 *
 * @type {readonly string[]}
 */
export const EVENT_TYPES = Object.freeze([
  'task.created',
  'task.completed',
  'capture.filed',
  'journal.written',
  'habit.ticked',
  'goal.created',
  'goal.completed',
  'memory.saved',
  'finance.synced',
  'integration.failed',
]);

/**
 * Urgency bands, most urgent first.
 *
 * `overdue` is NOT in this list and must never be. Being late is something
 * that happens to a task as days pass, so it is derived from the band plus
 * the day the band was chosen -- see lib/domain/derive/tasks.js. Storing it
 * would mean the data can disagree with the calendar.
 *
 * @type {readonly string[]}
 */
export const URGENCY_BANDS = Object.freeze(['today', 'week', 'later']);

/** How much a task is burning. Second sort key, after the band. */
export const TEMPERATURES = Object.freeze(['hot', 'warm', 'cold']);

/** A habit is either done/not done, or counted against a target. */
export const HABIT_TYPES = Object.freeze(['check', 'counter']);

/** An objective you hold, or a container for other work. */
export const GOAL_KINDS = Object.freeze(['objective', 'project']);

/**
 * What a finance account is. Net worth is cash + investment + asset - liability.
 *
 * @type {readonly string[]}
 */
export const ACCOUNT_KINDS = Object.freeze(['cash', 'investment', 'asset', 'liability']);

/**
 * Money moving.
 *
 * `transfer` is the one that saves you from a wrong number: moving money
 * between two accounts you own is neither income nor spending, and counting
 * it doubles your monthly total. Every aggregation excludes it.
 *
 * @type {readonly string[]}
 */
export const TRANSACTION_KINDS = Object.freeze(['income', 'expense', 'transfer']);

/** What a finance observation measured at a point in time. */
export const OBSERVATION_KINDS = Object.freeze(['balance', 'position']);

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
   * like a bug.
   */
  answerMaxTokens: 3000,
});

/**
 * Capabilities that exist only on the guide's full path. They are flags
 * rather than deleted code so that the local path stays honest about what it
 * is not doing yet.
 */
export const features = Object.freeze({
  telegramCapture: false,
  semanticMemory: false,
  morningBriefing: false,
  integrations: false,
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

/** Fallback currency for money that arrives without one. */
export const defaultCurrency = 'EUR';
