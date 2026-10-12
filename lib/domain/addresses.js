/**
 * Where a record opens: the one implementation of each screen's address.
 *
 * A screen reads its selection from the address (`?task=<id>`, `?goal=<id>`),
 * and two places need to write that address -- the screen's own links and an
 * answer's citations (#173, ADR 0028). Both call here, so a citation can only
 * ever open what the screen would open. The components' builders delegate to
 * these; nothing else spells a query string.
 *
 * Pure and plain Node: `lib/` cannot import a component, and the context
 * builds addresses without one.
 */

/**
 * @typedef {'board' | 'person'} CrmView
 */

/**
 * Where you are on the Finances screen: the selected account, the month
 * read, the selected transaction. Each by id or key, never by place in a
 * list.
 *
 * @typedef {object} FinancesPlace
 * @property {string | null} [account]
 * @property {string | null} [month] YYYY-MM
 * @property {string | null} [transaction]
 * @property {string | null} [category] a line of the month: a category id,
 *   or one of the Uncategorised lines (lib/domain/derive/finance.js)
 */

/**
 * The order the Finances screen writes its parameters in.
 *
 * @type {(keyof FinancesPlace)[]}
 */
const PLACE_KEYS = ['account', 'month', 'category', 'transaction'];

/**
 * A CRM address: selecting a task keeps the view, and closing the panel
 * keeps it too.
 *
 * @param {CrmView} view
 * @param {string | null} [taskId]
 * @returns {string}
 */
export function crmAddress(view, taskId = null) {
  const params = new URLSearchParams();
  if (view === 'person') params.set('view', 'person');
  if (taskId !== null) params.set('task', taskId);
  const query = params.toString();
  return query === '' ? '/crm' : '/crm?' + query;
}

/**
 * A Goals address.
 *
 * @param {string | null} [goalId]
 * @returns {string}
 */
export function goalsAddress(goalId = null) {
  return goalId === null ? '/goals' : '/goals?goal=' + encodeURIComponent(goalId);
}

/**
 * The Journal screen on a day.
 *
 * @param {string} dayKey
 * @returns {string}
 */
export function journalAddress(dayKey) {
  return '/journal?date=' + dayKey;
}

/**
 * A Finances address: selecting an account keeps the month you were
 * reading, and the reverse.
 *
 * @param {FinancesPlace} [place]
 * @returns {string}
 */
export function financesAddress(place = {}) {
  const params = new URLSearchParams();
  for (const key of PLACE_KEYS) {
    const value = place[key];
    if (typeof value === 'string' && value !== '') params.set(key, value);
  }
  const query = params.toString();
  return query === '' ? '/finances' : '/finances?' + query;
}

/**
 * The Nutrition & Health screen with a day's row open in the Health table.
 * The screen only shows days of its window, and ignores any other.
 *
 * @param {string | null} [dayKey]
 * @returns {string}
 */
export function nutritionAddress(dayKey = null) {
  return dayKey === null ? '/nutrition' : '/nutrition?day=' + dayKey;
}

/**
 * The Habits screen. It selects nothing from the address: a habit has no
 * panel, only the manage list and the history on one screen.
 *
 * @returns {string}
 */
export function habitsAddress() {
  return '/habits';
}
