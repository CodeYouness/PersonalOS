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
  'trade',
  'price',
  'transaction',
  'snapshot',
  'appointment',
  'category',
]);

/**
 * The destinations filed as a task. `people` differs from `task` in intent,
 * not in kind: both are a commitment, linked to whoever the sentence names
 * (docs/domain.md, "Task").
 *
 * @type {readonly string[]}
 */
export const TASK_DESTINATIONS = Object.freeze(['task', 'people']);

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
  'appointment',
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
  'capture.deleted',
  'capture.undone',
  'capture.refiled',
  'journal.written',
  'habit.ticked',
  'goal.created',
  'goal.completed',
  'memory.saved',
  'finance.synced',
  'integration.failed',
  'appointment.created',
  'appointment.synced',
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
 * The period a goal was promised for -- a label, never an expiry. In this
 * order on the Goals card and screen.
 */
export const GOAL_HORIZONS = Object.freeze(['week', 'month', 'open']);

/**
 * What a finance account is. Net worth is cash + investment + asset - liability.
 *
 * @type {readonly string[]}
 */
export const ACCOUNT_KINDS = Object.freeze(['cash', 'investment', 'asset', 'liability']);

/**
 * How an account is valued (#116). `balance`: you record what it is worth on
 * a date -- cash, a pension fund, a property, a debt. `units`: a holding such
 * as an ETF, valued by the units its trades leave you holding times the
 * latest price. Only an investment chooses; every other kind is `balance`,
 * and the choice is fixed once the account has data.
 *
 * @type {readonly string[]}
 */
export const ACCOUNT_VALUATIONS = Object.freeze(['balance', 'units']);

/**
 * What a finance category counts as (#136): money in, or money out. Stored
 * on a top-level category only; a subcategory takes its parent's. Fixed once
 * the category or a subcategory is in use, so last year's totals never flip.
 *
 * @type {readonly string[]}
 */
export const CATEGORY_KINDS = Object.freeze(['income', 'expense']);

/** Which way a trade moves units: in, or out. */
export const TRADE_DIRECTIONS = Object.freeze(['buy', 'sell']);

/**
 * The currencies money may be recorded in. EUR only, until exchange rates
 * exist: an account, a balance, a trade or a price in another currency is
 * refused at the store, so euros and dollars are never added as if they were
 * the same (#111). The first is the default for money that names none.
 *
 * @type {readonly string[]}
 */
export const FINANCE_CURRENCIES = Object.freeze(['EUR']);

/** What a finance observation measured at a point in time. */
export const OBSERVATION_KINDS = Object.freeze(['balance', 'position']);

/**
 * What a measurement may measure, and the one unit it is stored in. Closed:
 * a metric is added here when a sentence or a source produces it, not before
 * (ADR 0020). The unit is not the caller's to choose -- a weight is kg.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const MEASUREMENT_METRICS = Object.freeze({ weight: 'kg' });

/**
 * Numbers that are decisions, not accidents, for cards and routes not built
 * yet -- none of them belongs inline in a component once it exists. Not read
 * by any code today: each is claimed by the feature named next to it, and
 * stays here rather than being invented again when that feature lands.
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
  /** How many recent captures the capture log drawer shows. */
  captureLogCount: 20,
  /**
   * Answers need headroom: the model emits reasoning blocks before the text,
   * and a low ceiling makes the endpoint return an empty string that looks
   * like a bug.
   */
  answerMaxTokens: 3000,
  /**
   * The longest question the questions route takes (#172). A question is a
   * sentence, not a document: the cap keeps a pasted page from becoming a
   * model call, and is checked at the route, never by what the text says.
   */
  questionMaxChars: 1000,
  /**
   * How long the capture bar waits for an answer before it gives up (#172).
   * A question reads the whole archive, so it is far slower than a capture;
   * without a limit one that never settles would lock the bar -- captures
   * included -- until the page is reloaded.
   */
  questionTimeoutMs: 90_000,
  /**
   * The most characters a question sends the model as its context block
   * (#175, ADR 0028). Measured on what is SENT (`serializeContext`), not on
   * the records. Over it, old transactions are replaced by their monthly
   * figures; still over, the question is refused and nothing is sent.
   *
   * Sized to a price, not to the model's window (#204, ADR 0030). Above
   * 100,000 prompt tokens Haiku 5.5 charges five times as much on the WHOLE
   * prompt, cached parts included. Measured on `claude-haiku-5-5`
   * (2026-10-17), the worst mix an importer writes, transactions only, is
   * 0.488 tokens a character, and the fixed part of a question (instructions,
   * tool, a short question) 1,438 tokens. Rounded up to 0.52 and 1,500, a
   * full question stays at or under a 90,000-token ceiling, ten thousand
   * below the step. tests/lib/context-limit.test.js holds it there, and
   * `npm run measure:context` re-measures both numbers.
   */
  contextMaxChars: 170_000,
  /**
   * How many of the newest calendar months holding transactions are always
   * sent in full (#175). Recent detail is what "this month" and "last week"
   * need, and the months that go first are the ones whose monthly totals
   * answer the question just as well.
   */
  contextRecentMonths: 3,
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
  integrations: true,
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
 * The model each call type runs on when its variable is unset
 * (ANTHROPIC_MODEL_CLASSIFY, _EXTRACT, _ANSWER). One per call type, never one
 * for all: answering is long reasoning over the whole context, filing a
 * capture is a cheap pick between closed options (ADR 0030). Model names
 * change; the variables are the real control. See docs/development.md.
 *
 * A model here must accept a forced tool_choice: every call forces its one
 * tool. Sonnet 5.5 refuses it, and as a default would fail every call.
 * All three are on Haiku 5.5: classify was scored by npm run eval:classify
 * (#197), extract and answer follow it (ADR 0030).
 */
export const defaultModels = Object.freeze({
  /** Filing a capture, Refile included: lib/classify.js. */
  classify: 'claude-haiku-5-5',
  /** What is worth remembering from one journal entry: lib/extract.js. */
  extract: 'claude-haiku-5-5',
  /** A question over everything recorded: lib/answer.js. */
  answer: 'claude-haiku-5-5',
});

/** Fallback timezone, used only when USER_TIMEZONE is unset. */
export const defaultTimezone = 'Europe/Rome';

/** Fallback currency for money that arrives without one. */
export const defaultCurrency = 'EUR';
