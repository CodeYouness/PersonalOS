/**
 * The vocabulary of PersonalOS, in machine-readable form.
 *
 * This file has no runtime behaviour on purpose: it is the type-level twin of
 * docs/domain.md. When a concept changes, both change in the same commit.
 *
 * Two rules govern everything below and are worth reading before the types:
 *
 * 1. CANONICAL vs DERIVED. A field is canonical when you decided it or a
 *    source observed it. Anything computable from canonical data is derived
 *    and is NOT stored -- it is computed in lib/domain/derive/. The one
 *    documented exception is the net worth snapshot, which is a history that
 *    cannot be recomputed. See ADR 0008.
 *
 * 2. RELATIONS LIVE IN LINKS. No entity holds a foreign key to another. A
 *    task does not carry a personId; there is a Link saying
 *    task --involves--> person. One place to look, one place to query. See
 *    ADR 0006.
 */

/**
 * Fields every canonical entity carries. Not a base class -- JSDoc has no
 * useful inheritance here -- but the same four fields, spelled the same way,
 * on everything.
 *
 * `source` answers "who created this", which is the first question you ask
 * when a record looks wrong.
 *
 * @typedef {object} Envelope
 * @property {string} id prefixed reference, e.g. "task_9f2c"
 * @property {string} createdAt ISO instant
 * @property {string} updatedAt ISO instant
 * @property {'user'|'capture'|'journal'|'integration'|'derived'|'seed'} source
 */

/**
 * Provenance for anything that came from outside PersonalOS.
 *
 * The pair (source, externalId) is the deduplication key: it is what lets an
 * import run twice without doubling your net worth, and what lets a live
 * source supersede a stale row rather than sit beside it.
 *
 * @typedef {object} ExternalOrigin
 * @property {string} source the integration name, e.g. "scalable", "xlsx"
 * @property {string} externalId stable id in that system
 * @property {string} syncedAt ISO instant of the sync that wrote this
 * @property {string | null} sourceUpdatedAt when the source last changed it
 */

/**
 * An edge in the life graph.
 *
 * Links are their own collection rather than fields on entities, so that
 * relating two things never requires a write to either of them -- which
 * matters when the AI proposes a link with a confidence, or when the two ends
 * are owned by different parts of the system.
 *
 * `rel` comes from LINK_RELS. The vocabulary is closed: an open one becomes
 * unqueryable within a year because nobody remembers the spelling.
 *
 * @typedef {object} Link
 * @property {string} id
 * @property {string} from reference
 * @property {string} to reference
 * @property {string} rel one of LINK_RELS
 * @property {number | null} confidence 0..1 when a model proposed it, else null
 * @property {string} createdAt ISO instant
 * @property {'user'|'capture'|'journal'|'integration'|'derived'|'seed'} source
 */

/**
 * Something that happened, at a time.
 *
 * Append-only, and never the truth about state: an event points at the
 * canonical entity through `subject`. `payload` exists only for things that
 * have no entity of their own -- a failed sync, for instance.
 *
 * @typedef {object} Event
 * @property {string} id
 * @property {string} type one of EVENT_TYPES
 * @property {string} at ISO instant
 * @property {string} date day key, in the user's timezone, for timeline queries
 * @property {string | null} subject reference to the entity it concerns
 * @property {Record<string, unknown>} payload only what no entity holds
 * @property {'user'|'capture'|'journal'|'integration'|'derived'|'seed'} source
 */

/**
 * What you wrote, in your own words.
 *
 * The journal is canonical and is never rewritten by the system. Several
 * entries may share a day -- a morning one and an evening one are different
 * thoughts, not a document to be merged.
 *
 * @typedef {object} JournalEntry
 * @property {string} id
 * @property {string} date day key in the user's timezone
 * @property {string} text free-form; no structure is imposed
 * @property {string[]} tags
 * @property {string} createdAt ISO instant
 * @property {string} updatedAt ISO instant
 * @property {'user'|'capture'|'journal'|'integration'|'derived'|'seed'} source
 */

/**
 * Something the system claims to know.
 *
 * A memory is DERIVED from something you wrote or said; the journal entry or
 * the capture stays the primary record. That is the whole distinction: the
 * journal is what you wrote, memory is what was extracted from it, and
 * deleting a memory never touches the writing it came from.
 *
 * Rule enforced at the store boundary: a memory whose source is not `user`
 * must carry a `derived_from` link to its origin. There are no orphan
 * memories asserting facts with nothing behind them.
 *
 * `validFrom` / `validUntil` exist because knowledge expires. "Prefers
 * passive investing" was true from a date and may stop being true; without a
 * window the system would keep asserting it forever.
 *
 * @typedef {object} MemoryEntry
 * @property {string} id
 * @property {'fact'|'preference'|'decision'|'context'|'observation'|'event'} type
 * @property {string} content
 * @property {number} confidence 0..1; 1 when you stated it yourself
 * @property {string[]} tags
 * @property {string | null} validFrom day key, or null for "always"
 * @property {string | null} validUntil day key, or null for "still true"
 * @property {number[] | null} embedding reserved; unused on the local path
 * @property {string} createdAt ISO instant
 * @property {string} updatedAt ISO instant
 * @property {'user'|'capture'|'journal'|'integration'|'derived'|'seed'} source
 */

/**
 * A raw thing you said, before anything was made of it.
 *
 * Kept verbatim even after it has been filed, because the filing can be wrong
 * and the sentence cannot. `route` records how the destination was decided;
 * without it, an expired API key looks like a model that quietly got worse.
 *
 * @typedef {object} Capture
 * @property {string} id
 * @property {string} text exactly what arrived, never rewritten
 * @property {string} origin where it came from, e.g. "bar", "telegram"
 * @property {string} destination one of DESTINATIONS
 * @property {'model'|'rules'} route who decided the destination
 * @property {string} createdAt ISO instant
 * @property {string} updatedAt ISO instant
 * @property {'user'|'capture'|'journal'|'integration'|'derived'|'seed'} source
 */

/**
 * A commitment, almost always owed to someone.
 *
 * The single entity behind both the `task` and the `people` capture
 * destinations: they differ in whether a person is linked, not in kind.
 *
 * `band` is what you chose. `bandSetOn` is the day you chose it, and the two
 * together are what make "overdue" derivable: a task still sitting in `today`
 * on a later day is late. Storing `overdue` would let the data disagree with
 * the calendar, which is why the band vocabulary does not contain it.
 *
 * @typedef {object} Task
 * @property {string} id
 * @property {string} title
 * @property {string} note
 * @property {'today'|'week'|'later'} band
 * @property {string} bandSetOn day key when the band was last chosen
 * @property {'hot'|'warm'|'cold'} temperature
 * @property {string[]} tags
 * @property {number} position order within the band; set by dragging
 * @property {string | null} completedAt ISO instant; completing never deletes
 * @property {string} createdAt ISO instant
 * @property {string} updatedAt ISO instant
 * @property {'user'|'capture'|'journal'|'integration'|'derived'|'seed'} source
 */

/**
 * Someone tasks can be owed to, with enough context to prepare a call.
 * Not a contact book: no pipeline, no deal, no stage.
 *
 * @typedef {object} Person
 * @property {string} id
 * @property {string} name
 * @property {string} organization
 * @property {string} kind free-form: client, friend, supplier
 * @property {string} note
 * @property {string} createdAt ISO instant
 * @property {string} updatedAt ISO instant
 * @property {'user'|'capture'|'journal'|'integration'|'derived'|'seed'} source
 */

/**
 * A promise, not a measurement.
 *
 * This distinction is why goals are stored on their own and never inside a
 * daily log: "I read today" belongs to today and resetting it tomorrow is
 * correct, whereas "sign the contract this week" does not stop existing on
 * Monday morning. Goals are closed by you or removed by you, never by the
 * calendar. There is no period logic anywhere near them.
 *
 * `kind: 'project'` is how a goal becomes a container for other work, linked
 * by `belongs_to`. That is deliberately not a separate entity: a project is
 * an objective with children, and a second collection would earn nothing.
 *
 * `progress` is a manual fallback. When a goal is linked to something
 * countable, progress is derived instead -- see lib/domain/derive/goals.js.
 *
 * @typedef {object} Goal
 * @property {string} id
 * @property {string} name
 * @property {'objective'|'project'} kind
 * @property {'week'|'month'|'open'} horizon a label, never an expiry
 * @property {boolean} done
 * @property {{ current: number, target: number } | null} progress
 * @property {string | null} targetDate day key, or null
 * @property {string} createdAt ISO instant
 * @property {string} updatedAt ISO instant
 * @property {'user'|'capture'|'journal'|'integration'|'derived'|'seed'} source
 */

/**
 * Something you do every day, configured in the profile rather than in code.
 * A `check` habit is done or not; a `counter` habit is counted against a
 * target -- four glasses of water out of eight.
 *
 * @typedef {object} Habit
 * @property {string} id
 * @property {string} label
 * @property {'check'|'counter'} type
 * @property {number | null} target counter habits only
 * @property {boolean} archived keeps the history, stops appearing today
 */

/**
 * Who the system thinks you are, plus the lists that configure it.
 *
 * Configuration in the sense that cards read it instead of hard-coding it --
 * but personal, so the real one only ever lives in the working data file,
 * never in the seed.
 *
 * `financeCategories` is here for the same reason `habits` is: your
 * categories are yours. "Pizzeria" is not a constant the template ships.
 *
 * @typedef {object} Profile
 * @property {string} name
 * @property {string} role
 * @property {string} city
 * @property {string} focus what today is actually about
 * @property {Habit[]} habits
 * @property {number} calorieTarget
 * @property {string} baseCurrency ISO code; everything is reported in it
 * @property {FinanceCategory[]} financeCategories
 */

/**
 * A bucket for money moving. Yours, not the template's.
 *
 * @typedef {object} FinanceCategory
 * @property {string} id
 * @property {string} name
 * @property {'income'|'expense'} kind
 * @property {boolean} archived
 */

/**
 * @typedef {object} Meal
 * @property {string} id
 * @property {string} time HH:MM in the user's timezone
 * @property {string} name
 * @property {number} calories
 * @property {number} protein grams
 * @property {number} carbs grams
 * @property {number} fat grams
 * @property {boolean} estimated cleared once you correct a value by hand
 */

/**
 * A measurement you reported, such as a weight.
 *
 * @typedef {object} Measurement
 * @property {string} id
 * @property {string} metric
 * @property {number} value
 * @property {string} unit
 * @property {string} recordedAt ISO instant
 */

/**
 * One calendar day of measurements, keyed by day key.
 *
 * Not a place for anything that must survive the day -- goals in particular
 * do not live here. A day that was never written to reads back as an empty
 * log rather than as missing, so callers can tell "you recorded nothing"
 * apart from "outside the window".
 *
 * @typedef {object} DailyLog
 * @property {string} date YYYY-MM-DD in the user's timezone
 * @property {Record<string, boolean | number>} habits by habit id
 * @property {Meal[]} meals
 * @property {Measurement[]} measurements
 * @property {string[]} notes captures filed here with no card of their own
 */

/**
 * Where money sits. Net worth is
 * cash + investment + asset - liability, over the latest observation of each.
 *
 * @typedef {object} FinanceAccount
 * @property {string} id
 * @property {string} name
 * @property {'cash'|'investment'|'asset'|'liability'} kind
 * @property {string} currency ISO code
 * @property {ExternalOrigin | null} origin set when a source owns this account
 * @property {boolean} archived
 * @property {string} createdAt ISO instant
 * @property {string} updatedAt ISO instant
 * @property {'user'|'capture'|'journal'|'integration'|'derived'|'seed'} source
 */

/**
 * What an account was worth at a moment, according to somebody.
 *
 * This is the entity that makes net worth possible, and the reason it cannot
 * be derived from transactions: an investment changes value when the market
 * moves and no transaction happens at all, and a pension or a property never
 * appears in a transaction list in the first place. Balances have to be
 * observed, not computed.
 *
 * Amounts are integers in minor units (cents) to keep money away from
 * floating point. See ADR 0009.
 *
 * @typedef {object} FinanceObservation
 * @property {string} id
 * @property {string} accountId reference to a FinanceAccount
 * @property {'balance'|'position'} kind
 * @property {number} amount minor units, signed: a liability is negative
 * @property {string} currency ISO code
 * @property {string} date day key the observation refers to
 * @property {string} observedAt ISO instant
 * @property {ExternalOrigin | null} origin
 * @property {string} createdAt ISO instant
 * @property {string} updatedAt ISO instant
 * @property {'user'|'capture'|'journal'|'integration'|'derived'|'seed'} source
 */

/**
 * Money moving. The flow, as opposed to the stock an observation records.
 *
 * TWO ZONES OF OWNERSHIP, and getting this wrong is the classic sync bug.
 *
 *   Source-owned  date, amount, currency, description, accountId, kind, origin
 *   Yours         categoryId, note, and any links
 *
 * An importer rewrites the first group and MUST NOT touch the second. That is
 * what lets you recategorise a transaction inside PersonalOS and re-run the
 * import tomorrow without losing the work.
 *
 * `kind: 'transfer'` is the one that saves you from a wrong number: money
 * moved between two accounts you own is neither income nor spending, and
 * counting it doubles your monthly total. Every aggregation excludes it.
 *
 * @typedef {object} Transaction
 * @property {string} id
 * @property {string} date day key
 * @property {number} amount minor units, always positive; `kind` gives direction
 * @property {string} currency ISO code
 * @property {string} description as the source wrote it
 * @property {'income'|'expense'|'transfer'} kind
 * @property {string} accountId the account it left or landed in
 * @property {string | null} counterAccountId the other side, transfers only
 * @property {string | null} categoryId yours; an importer never sets it
 * @property {string} note yours; an importer never sets it
 * @property {ExternalOrigin | null} origin
 * @property {string} createdAt ISO instant
 * @property {string} updatedAt ISO instant
 * @property {'user'|'capture'|'journal'|'integration'|'derived'|'seed'} source
 */

/**
 * Net worth on a date.
 *
 * Derived from observations -- and yet stored, which is the single documented
 * exception to the no-persisted-derivations rule. The reason is that this is
 * a history you cannot recompute: yesterday's market value is gone tomorrow.
 * Recomputing the series would quietly rewrite your past every time you
 * looked at it. See ADR 0008.
 *
 * @typedef {object} NetWorthSnapshot
 * @property {string} id
 * @property {string} date day key
 * @property {number} netWorth minor units
 * @property {number} cash minor units
 * @property {number} invested minor units
 * @property {number} otherAssets minor units
 * @property {number} liabilities minor units, positive magnitude
 * @property {string} currency base currency at the time
 * @property {Record<string, number>} rates FX used, so the past stays fixed
 * @property {string} notes ambiguities the extraction ran into; you read these
 * @property {string} createdAt ISO instant
 * @property {'user'|'capture'|'journal'|'integration'|'derived'|'seed'} source
 */

/**
 * What an integration did, last time it ran. Feeds the Sources view: a net
 * worth that has not synced in nine days but looks current is the same lie as
 * a classifier that silently fell back to keyword rules.
 *
 * @typedef {object} SyncState
 * @property {string} integration
 * @property {string | null} lastRunAt ISO instant
 * @property {'ok'|'error'|'never'} status
 * @property {string} error empty when status is not 'error'
 * @property {number} itemCount records written by the last successful run
 */

export {};
