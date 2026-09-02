/**
 * The vocabulary of PersonalOS, in machine-readable form.
 *
 * This file has no runtime behaviour on purpose: it is the type-level twin of
 * docs/domain.md. When a concept changes, both change together, and the type
 * checker makes it hard to let them drift apart quietly.
 */

/**
 * Something you do every day, configured in the profile rather than in code.
 * A `check` habit is done or not; a `counter` habit is counted against a
 * target -- four glasses of water out of eight.
 *
 * @typedef {object} Habit
 * @property {string} id
 * @property {string} label
 * @property {'check' | 'counter'} type
 * @property {number | null} target counter habits only
 */

/**
 * Who the system thinks you are. Configuration in the sense that the cards
 * read it instead of hard-coding it -- but personal, so the real one only
 * ever lives in the working data file, never in the seed.
 *
 * @typedef {object} Profile
 * @property {string} name
 * @property {string} role
 * @property {string} city
 * @property {string} focus what today is actually about
 * @property {Habit[]} habits
 * @property {number} calorieTarget
 */

/**
 * A commitment, almost always owed to someone. This is the single entity
 * behind both the `task` and the `people` capture destinations: they differ
 * in whether a person is attached, not in kind.
 *
 * `band` is never created as 'overdue' -- a task is moved there by time
 * passing. `position` orders a task inside its band and is what you set by
 * dragging a card; it is the third sort key the Session card uses.
 *
 * @typedef {object} Task
 * @property {string} id
 * @property {string} title
 * @property {string} note
 * @property {'overdue' | 'today' | 'week' | 'later'} band
 * @property {'hot' | 'warm' | 'cold'} temperature
 * @property {string | null} personId
 * @property {string[]} tags
 * @property {number} position
 * @property {string} createdAt ISO instant
 * @property {string | null} completedAt ISO instant; completing never deletes
 */

/**
 * Someone tasks can be owed to. Not a contact book: it exists so the CRM can
 * group by person and so a call can be prepared in one glance.
 *
 * @typedef {object} Person
 * @property {string} id
 * @property {string} name
 * @property {string} organization
 * @property {string} kind free-form: client, friend, supplier
 * @property {string} note
 * @property {string} createdAt ISO instant
 */

/**
 * A raw thing you said, before anything was made of it. Kept verbatim even
 * after it has been filed, because the filing can be wrong and the sentence
 * cannot.
 *
 * `route` records how the destination was decided. A silent fallback is a
 * lie: without this field, an expired key looks like a model that got worse.
 *
 * @typedef {object} Capture
 * @property {string} id
 * @property {string} text
 * @property {string} source where it came from, e.g. "bar"
 * @property {string} destination one of DESTINATIONS
 * @property {string | null} targetId the record it produced, when there is one
 * @property {'model' | 'rules'} route
 * @property {string} createdAt ISO instant
 */

/**
 * Something the system should remember. Every capture writes one, whatever
 * else it also writes: the destination decides which card lights up, never
 * whether the sentence is remembered.
 *
 * @typedef {object} MemoryEntry
 * @property {string} id
 * @property {string} text
 * @property {string} source
 * @property {string} createdAt ISO instant
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
 * A measurement you reported, such as a weight. Health is otherwise pure
 * aggregation over meals, so this is the only thing it stores of its own.
 *
 * @typedef {object} Measurement
 * @property {string} id
 * @property {string} metric
 * @property {number} value
 * @property {string} unit
 * @property {string} recordedAt ISO instant
 */

/**
 * One calendar day, keyed by day key. Measurements belong to a day, so they
 * live here; goals deliberately do not.
 *
 * @typedef {object} DailyLog
 * @property {string} date YYYY-MM-DD in the user's timezone
 * @property {Record<string, boolean | number>} habits by habit id
 * @property {Meal[]} meals
 * @property {Measurement[]} measurements
 * @property {string[]} notes captures filed here that have no card of their own
 */

/**
 * A promise, not a measurement. This distinction is the whole reason goals
 * are stored on their own and never inside a daily log: a habit belongs to a
 * day and resetting it is correct, whereas "sign the contract this week" does
 * not stop existing on Monday morning. Goals are closed by you or removed by
 * you, never by the calendar.
 *
 * @typedef {object} Goal
 * @property {string} id
 * @property {string} name
 * @property {boolean} done
 * @property {{ current: number, target: number } | null} progress
 */

/**
 * @typedef {object} Goals
 * @property {Goal[]} week
 * @property {Goal[]} month
 */

/**
 * What the system did, and when. The material a weekly review is made of.
 *
 * @typedef {object} ActivityEntry
 * @property {string} id
 * @property {string} action e.g. "task.completed"
 * @property {string} subjectId
 * @property {string} detail
 * @property {string} at ISO instant
 */

export {};
