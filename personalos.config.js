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
  'review',
  'action',
  'run',
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
 * The surfaces a capture can arrive through. `origin` names the surface, not
 * the device: a browser on the phone is still `bar`. `telegram` is reserved
 * for the flagged-off surface.
 *
 * @type {readonly string[]}
 */
export const CAPTURE_ORIGINS = Object.freeze(['bar', 'shortcut', 'telegram']);

/**
 * Who decided a capture's destination: the model, the keyword rules, or
 * nobody yet. A capture is saved `unclassified` before any tier runs (ADR
 * 0037), and gets `model` or `rules` once, when the classifier answers. One
 * the classifier never answered for -- the process died, the store refused
 * the update -- stays `unclassified`, and the capture log shows it.
 *
 * @type {readonly ('model' | 'rules' | 'unclassified')[]}
 */
export const CAPTURE_ROUTES = Object.freeze(/** @type {const} */ (['model', 'rules', 'unclassified']));

/**
 * What an action was made for (docs/domain.md, "Action"): a capture, a
 * journal entry, or an answer in the check-in. Closed, like every vocabulary
 * here: the store refuses an action record whose origin is not one of these.
 * A channel or a skill that writes through actions joins this list first.
 *
 * @type {readonly ('capture' | 'journal' | 'checkin')[]}
 */
export const ACTION_ORIGINS = Object.freeze(/** @type {const} */ (['capture', 'journal', 'checkin']));

/**
 * What can run a schedule's work: a script, or the small model. Never the
 * strong model -- nothing expensive runs without the user (ADR 0037).
 *
 * @type {readonly ('script' | 'small-model')[]}
 */
export const SCHEDULE_ENGINES = Object.freeze(/** @type {const} */ (['script', 'small-model']));

/**
 * What a schedule does with a slot it missed (ADR 0062). `once`: run late,
 * however late, one time. `same-day`: run late only while the slot's day is
 * still today, otherwise drop it.
 *
 * @type {readonly ('once' | 'same-day')[]}
 */
export const CATCH_UP_RULES = Object.freeze(/** @type {const} */ (['once', 'same-day']));

/**
 * The schedules, the only things that run on their own (ADR 0062; domain.md,
 * "Schedule"). Time of day is read in USER_TIMEZONE; `days` are ISO weekdays,
 * 1 Monday to 7 Sunday. A schedule is added here together with its job in
 * `lib/scheduler/jobs.js` (a test fails when the two disagree). The id is
 * the key of its runs.
 *
 * @type {readonly import('./lib/domain/types.js').Schedule[]}
 */
export const SCHEDULES = Object.freeze([
  Object.freeze({
    id: 'prune-runs',
    time: '03:30',
    days: Object.freeze([1, 2, 3, 4, 5, 6, 7]),
    engine: 'script',
    catchUp: 'once',
  }),
  Object.freeze({
    id: 'nightly-backup',
    time: '03:00',
    days: Object.freeze([1, 2, 3, 4, 5, 6, 7]),
    engine: 'script',
    catchUp: 'once',
  }),
  Object.freeze({
    id: 'sync-calendar',
    time: '07:00',
    days: Object.freeze([1, 2, 3, 4, 5, 6, 7]),
    engine: 'script',
    catchUp: 'once',
  }),
  Object.freeze({
    id: 'sync-scalable',
    time: '07:00',
    days: Object.freeze([1]),
    engine: 'script',
    catchUp: 'once',
  }),
]);

/** The ids of {@link SCHEDULES}, the closed list a run's `schedule` is checked against. */
export const SCHEDULE_IDS = Object.freeze(SCHEDULES.map((schedule) => schedule.id));

/**
 * Who started a run (ADR 0063): the scheduler, the user's button, or a
 * Telegram message.
 */
export const RUN_STARTERS = Object.freeze(/** @type {const} */ (['schedule', 'user', 'telegram']));

/** @typedef {(typeof RUN_STARTERS)[number]} RunStarter */

/**
 * The short codes a job gives as a run's `reason` when it skips or fails for
 * an expected cause (ADR 0063), so a screen and a test name one string.
 */
export const RUN_REASONS = Object.freeze({
  /** The source has nothing configured: a skipped run, not a failed one. */
  notConfigured: 'not-configured',
  /** The source's login expired: a failed run that needs the user. */
  needsLogin: 'needs-login',
  /** The backup has no destination configured. */
  backupDirNotSet: 'PERSONALOS_BACKUP_DIR is not set',
});

/**
 * How a run ended. `skipped` is a run that chose not to do its work and says
 * why in its reason ("nothing configured"), so it is not mistaken for one
 * that never tried.
 *
 * @type {readonly ('ok' | 'failed' | 'skipped')[]}
 */
export const RUN_OUTCOMES = Object.freeze(/** @type {const} */ (['ok', 'failed', 'skipped']));

/**
 * The kinds of record a run can count in `wrote` -- a count of what it
 * changed, per kind. A ticket whose job writes a new kind adds it here.
 *
 * @type {readonly string[]}
 */
export const RUN_WRITE_KINDS = Object.freeze([
  'appointments', 'accounts', 'observations', 'trades', 'prices', 'transactions', 'snapshots', 'files',
  // Runs removed by the nightly prune.
  'runs',
  // The nightly backup (#288): copies made, and how many it kept and removed.
  'backups', 'backupsKept', 'backupsRemoved',
]);

/**
 * How long the nightly backup keeps its copies (#288): every day for this
 * many days, and the earliest copy of each of this many months.
 */
export const backupRetention = Object.freeze({ dailyDays: 30, months: 12 });

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
  /**
   * provenance: memory -> journal | capture, task -> capture, and a task or
   * a transaction read off a check-in's open answer -> its journal entry
   */
  'derived_from',
  /** money aimed at something: transaction -> goal */
  'funds',
  /**
   * a refund and the purchase it gives money back for: transaction (money
   * in) -> transaction (money out). The store checks the pair (ADR 0055).
   */
  'refund_of',
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
  'checkin',
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
  'review.completed',
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

/**
 * Why a scheduled habit was not kept on a day (ADR 0037), each with the label
 * the screens show, in the order they offer them. Closed: a reason is added
 * here, and documented in docs/domain.md, never accepted as a free string.
 * `paused` is the one that takes the day out of the habit's rate; the others
 * are misses, counted by their reason.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const HABIT_SKIP_REASONS = Object.freeze({
  forgotten: 'Forgotten',
  'too-heavy': 'Too heavy',
  'on-purpose': 'Skipped on purpose',
  paused: 'Paused',
});

/** An objective you hold, or a container for other work. */
export const GOAL_KINDS = Object.freeze(['objective', 'project']);

/**
 * The spans a review can cover (ADR 0034). Today only the week; a month or a
 * year would join here, with the rule for the first day of its period.
 *
 * @type {readonly string[]}
 */
export const REVIEW_PERIODS = Object.freeze(['week']);

/**
 * The three questions a review asks, in order, each with the key its answer is
 * stored under. Wording only: a constant of the product, not a vocabulary --
 * the keys are fixed by the review record (ADR 0034), the labels may be
 * reworded freely.
 *
 * @type {readonly { key: 'worked' | 'heldBack' | 'change', label: string }[]}
 */
export const REVIEW_QUESTIONS = Object.freeze([
  Object.freeze({ key: /** @type {const} */ ('worked'), label: 'What worked' }),
  Object.freeze({ key: /** @type {const} */ ('heldBack'), label: 'What held me back' }),
  Object.freeze({ key: /** @type {const} */ ('change'), label: 'What I change next week' }),
]);

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

/**
 * Who an `origin` can name: the systems whose records PersonalOS holds a copy
 * of. Closed, like every vocabulary here; the store refuses an origin whose
 * source is not one of these values. `demo` marks the seed's sample rows and
 * does NOT make an account synced (docs/domain.md, FinanceAccount).
 * `statement` is a bank or card statement imported by
 * `npm run data:import-statement` (ADR 0041): its transactions and the
 * opening balance it read, never an account.
 *
 * @type {Readonly<{ scalable: 'scalable', degiro: 'degiro', demo: 'demo', sheet: 'sheet', statement: 'statement', googleCalendar: 'google-calendar' }>}
 */
export const ORIGIN_SOURCES = Object.freeze({
  scalable: 'scalable',
  degiro: 'degiro',
  demo: 'demo',
  sheet: 'sheet',
  statement: 'statement',
  googleCalendar: 'google-calendar',
});

/** @type {readonly string[]} */
export const ORIGIN_SOURCE_VALUES = Object.freeze(Object.values(ORIGIN_SOURCES));

/**
 * The words a statement uses for a deposit's interest in its movement type
 * (ADR 0056): the bank's own type, which the statement importer keeps on the
 * movement's origin (`origin.detail.type`, ADR 0041) -- Revolut's `Tipo` --
 * and copies onto the fee charged on the row, the tax withheld on interest
 * (`part: 'fee'`). A movement from a statement whose type is one of these,
 * ignoring case, is interest; the lists fold an account's month of it into
 * one row. Read, never written: nothing is stored and nothing is refused by
 * it, so a word added here applies to every movement already imported.
 * Closed: a bank whose word differs is added here and in docs/domain.md.
 *
 * @type {readonly string[]}
 */
export const INTEREST_MOVEMENT_TYPES = Object.freeze(['Interessi']);

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
 * The areas a day's time is declared against (ADR 0037), each with the label
 * the screens show, in the order they show them. Closed: an area is added
 * here, and documented in docs/domain.md, never accepted as a free string.
 * Time is declared by you, never measured from a screen or a calendar.
 * A check habit may be counted from one of them (ADR 0039). Study was one;
 * it is part of Projects since schema 23 (ADR 0039).
 *
 * @type {Readonly<Record<string, string>>}
 */
export const TIME_AREAS = Object.freeze({
  work: 'Work',
  projects: 'Projects',
  training: 'Training',
  refereeing: 'Refereeing',
  gaming: 'Gaming',
});

/**
 * Numbers that are decisions, not accidents -- none of them belongs inline in
 * the code that reads it. Some are read today; the rest are claimed by the
 * feature named next to them, and stay here rather than being invented again
 * when that feature lands.
 */
export const limits = Object.freeze({
  /** Runs older than this many days are removed by the nightly prune (ADR 0063). */
  runRetentionDays: 90,
  /** How often the scheduler asks whether a schedule is due (ADR 0062). */
  schedulerTickMs: 60_000,
  /** The longest answer to one of a review's three questions (ADR 0034). */
  reviewAnswerMaxLength: 2000,
  /** The longest lever -- one sentence for next week, not a plan. */
  reviewLeverMaxLength: 300,
  /**
   * Home's "Needs you" (ADR 0040): how many of the tasks overdue or due today
   * it lists, most urgent first, before "and N more" sends you to the CRM.
   */
  homeTaskCount: 5,
  /** Home's "Worth noting" says at most this many sentences (ADR 0040). */
  homeNotesMax: 3,
  /**
   * "Worth noting": the habits kept so far this week differ from the four
   * weeks before by at least this many percentage points...
   */
  homeKeptRatePoints: 15,
  /**
   * ...and only once both rest on at least this many scheduled habit-days:
   * on a Monday morning one miss is not a trend.
   */
  homeKeptRateMinDays: 5,
  /**
   * "Worth noting": last week's spending is at least this share off the
   * weekly mean of the weeks before it (0.3 = 30% more or less)...
   */
  homeSpendingRatio: 0.3,
  /** ...with at least this many of those weeks having any spending. */
  homeSpendingMinWeeks: 2,
  /**
   * "Worth noting": a habit not kept on this many of its scheduled days
   * running, before today. Paused days and days with nothing recorded are
   * passed over, not counted: forgetting to record is not failing.
   */
  homeMissedRunDays: 3,
  /**
   * "Worth noting": net worth moved by at least this share of what it was 30
   * days before (0.05 = 5%).
   */
  homeNetWorthRatio: 0.05,
  /**
   * The one scale a day's mood and its energy are each read on, both ends
   * included (ADR 0035, 0037). One scale for both, so the two read alike.
   */
  dayReadingMin: 1,
  dayReadingMax: 5,
  /**
   * Time against an area is declared in steps of this many minutes, a half
   * hour (ADR 0037): an evening's honest guess, not a stopwatch.
   */
  timeStepMinutes: 30,
  /** The most one area can take in a day: the whole day. */
  timeAreaMaxMinutes: 24 * 60,
  /**
   * The target savings rate (ADR 0045) is a whole percent from this to that,
   * both included, or none. Not 0 -- a target of saving nothing is no target
   * -- and not 100: spending nothing at all is not a plan.
   */
  savingsTargetMin: 1,
  savingsTargetMax: 99,
  /**
   * Finances' Transactions card, reading a month or a year with nothing
   * selected (ADRs 0046, 0048), lists this many of the newest movements and
   * says how many more there are, with a link to show them all: a year is
   * hundreds of rows, and nobody reads them all. A hundred (ADR 0058), so a
   * month a little over the old fifty is simply listed whole. A category or
   * a tag narrows it, and is listed whole; a search (ADR 0058) is capped the
   * same way. A line's movements opened in place read the same cap.
   */
  financeListMax: 100,
  /**
   * The longest search the Transactions card reads (ADR 0058), in
   * characters, after trimming: what is typed past it is dropped. A search is
   * a few words, and the address carries it.
   */
  financeSearchMaxLength: 100,
  /**
   * A movement may be counted over the months it is for (ADR 0052) -- a
   * salary for three months paid at once, a year's insurance -- at most this
   * many months, both ends included. Two years: a longer range is a typo
   * more often than a plan.
   */
  financeCountedOverMaxMonths: 24,
  /**
   * A refund is paired with the purchase it gives money back for (ADR 0055).
   * The movement's panel offers the purchases dated at most this many days
   * before the refund -- a return window is weeks, a quarter at most -- and
   * at most `financeRefundCandidatesMax` of them, saying how many more there
   * are. The store refuses only a purchase dated after its refund: an older
   * one is rare, not wrong.
   */
  financeRefundWindowDays: 90,
  financeRefundCandidatesMax: 20,
  /**
   * A deposit pays interest every day, a few cents, and a statement writes
   * the tax withheld on it as a fee of its own (ADR 0056): sixty rows a month
   * that say nothing one by one. Finances' lists fold an account's interest
   * movements of a month into one net row when a list holds at least this
   * many of them; fewer stay as they are. Three: a day's interest and its
   * fee are two rows, and two rows need no summary.
   */
  financeInterestRunMin: 3,
  /**
   * Income & spending's day columns (ADR 0053, amended) mark a day's income
   * only when it is at least this whole percent of the month's income,
   * rounded up to a whole euro (`dayMarkFloor`): a deposit's daily interest
   * of a few cents is not a payday, and marked it would put a mark on almost
   * every day. The day's tooltip and its name still say what came in,
   * whatever its size.
   */
  financeDayIncomeMarkPercent: 1,
  /**
   * Finances' accounts table (ADR 0048) folds an account worth zero or
   * unknown under "N more accounts" when nothing -- a movement, a balance, a
   * trade -- was recorded on it in this many days up to today. A closed card
   * or an empty pot stays one click away without taking a row.
   */
  financeQuietAccountDays: 90,
  /**
   * Finances' accounts table (ADR 0049) says "since 2 Jan" after an account
   * whose value is older than this many days: about a month and its slack,
   * so a balance typed once a month never shows it, and one forgotten does.
   * The table prints no per-row date otherwise.
   */
  financeStaleAccountDays: 35,
  /**
   * The tax on a capital gain, in percent, that a holding's profit "after
   * tax" is shown net of (ADR 0051): Italy's 26%, applied to every holding.
   * A loss is not reduced by it.
   */
  financeCapitalGainsTaxPercent: 26,
  /**
   * Italy's rate on government bonds (BTP and the like), 12.5%. Claimed, not
   * read: a holding cannot say yet that it is one, so every holding takes the
   * rate above (ADR 0051 says what would be needed).
   */
  financeGovernmentBondTaxPercent: 12.5,
  /** How far back the Health card aggregates. */
  healthWindowDays: 30,
  /** How far ahead recurring calendar events are expanded. */
  calendarWindowDays: 14,
  /** Server-side cache for the parsed iCal feed. */
  calendarCacheMs: 5 * 60 * 1000,
  /** How many recent captures the capture log drawer shows. */
  captureLogCount: 20,
  /**
   * A capture's `saidAt` this far ahead of the server is clock drift and counts
   * as now; further ahead is refused (ADR 0033). The capture log shows when a
   * capture was said once it differs from when it was written by more than
   * this.
   */
  saidAtDriftMinutes: 5,
  /** The longest `clientId` a client may send (ADR 0033); a UUID is 36. */
  clientIdMaxLength: 200,
  /**
   * Answers need headroom: the model emits reasoning blocks before the text,
   * and a low ceiling makes the endpoint return an empty string that looks
   * like a bug.
   */
  answerMaxTokens: 3000,
  /**
   * A classification is one tool call and no text, but a meal with every
   * field and a time measured 205 tokens on Haiku 5.5: at 200 it was cut
   * off and filed by the rules, with no estimate (#207). Twice that and
   * some. A call is billed for the tokens it uses, not this ceiling.
   */
  classifyMaxTokens: 512,
  /**
   * An extraction is one tool call holding up to `MAX_PROPOSALS` statements.
   * Five long ones (114 to 194 characters each, from a long made-up entry)
   * measured 365 tokens on Haiku 5.5 (#210). A reply cut off here fails the
   * extraction rather than offering a partial list.
   */
  extractMaxTokens: 1000,
  /**
   * Reading the check-in's open answer is one tool call holding a short
   * list of actions -- a habit, an expense, an area's time -- each a name
   * and a few params. Not measured yet: twice the classifier's ceiling,
   * which one record with every field fits in, for a sentence that files
   * three or four. A reply cut off here files nothing from the sentence;
   * its journal entry is already saved (rule 2).
   */
  checkinMaxTokens: 1024,
  /**
   * How long the check-in waits for the open answer to be read before it
   * gives up on the model, and files the journal entry alone. The entry is
   * saved before the call, so a slow model costs only the records it would
   * have drawn, never the sentence.
   */
  checkinTimeoutMs: 15_000,
  /**
   * `npm run data:categorise -- --model` (ADR 0043) asks for this many
   * merchant keys in one call: one tool call answering a category id or
   * none per key. Enough that a few hundred keys are a handful of calls,
   * few enough that one failed call leaves only these unproposed.
   */
  categoriseBatchKeys: 40,
  /**
   * The ceiling on that reply. An answer is a short reference and an id,
   * about 25 tokens; 40 of them fit with room to spare. Not measured yet. A
   * reply cut off here is a failed call: its keys stay unproposed.
   */
  categoriseMaxTokens: 2048,
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
 * (ANTHROPIC_MODEL_CLASSIFY, _EXTRACT, _ANSWER, _CHECKIN, _CATEGORISE). One per
 * call type, never one for all: answering is long reasoning over the whole context, filing a
 * capture is a cheap pick between closed options (ADR 0030). Model names
 * change; the variables are the real control. See docs/development.md.
 *
 * Every call asks for its one tool. A model that refuses a forced
 * tool_choice -- Sonnet 5.5, Opus 5.5 -- is offered the tool instead, by the
 * provider (lib/ai/providers/anthropic.js), so it can be named here.
 * All five are on Haiku 5.5: classify was scored by npm run eval:classify
 * (#197), extract and answer follow it (ADR 0030), and so does the check-in,
 * scored by `npm run eval:classify -- --suite checkin` once it has been run,
 * and categorising, a pick from a closed list like filing (ADR 0043).
 */
export const defaultModels = Object.freeze({
  /** Filing a capture, Refile included: lib/classify.js. */
  classify: 'claude-haiku-5-5',
  /** What is worth remembering from one journal entry: lib/extract.js. */
  extract: 'claude-haiku-5-5',
  /** A question over everything recorded: lib/answer.js. */
  answer: 'claude-haiku-5-5',
  /**
   * The check-in's open answer read for records (ADR 0037): the classifier's
   * small model, since it is the same kind of pick among closed options.
   * lib/checkin/interpret.js.
   */
  checkin: 'claude-haiku-5-5',
  /**
   * Proposing a category for the statement movements no rule covers (ADR
   * 0043): a pick from a closed list per merchant key, like filing a
   * capture. Run by hand, `npm run data:categorise -- --model`, never by a
   * screen. scripts/categorise/model.js.
   */
  categorise: 'claude-haiku-5-5',
});

/**
 * What a model costs, for the run log's derived cost (ADR 0063): micro-dollars
 * per million tokens, read 2026-10-15 from
 * https://platform.claude.com/docs/en/about-claude/pricing (the same figures
 * `scripts/eval-classify.js` prices a run with). Haiku 5.5 is the price for
 * prompts up to 100,000 tokens. A model missing here is shown with no cost,
 * never at zero.
 *
 * @type {Readonly<Record<string, { inputPerMTok: number, outputPerMTok: number }>>}
 */
export const MODEL_PRICES = Object.freeze({
  'claude-haiku-5-5': Object.freeze({ inputPerMTok: 100_000, outputPerMTok: 500_000 }),
  'claude-sonnet-5-5': Object.freeze({ inputPerMTok: 2_000_000, outputPerMTok: 10_000_000 }),
});

/** Fallback timezone, used only when USER_TIMEZONE is unset. */
export const defaultTimezone = 'Europe/Rome';

/** Fallback currency for money that arrives without one. */
export const defaultCurrency = 'EUR';
