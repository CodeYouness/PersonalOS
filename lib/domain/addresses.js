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
 * read and whether Income & spending reads it or its year, the selected
 * transaction. Each by id or key, never by place in a list.
 *
 * @typedef {object} FinancesPlace
 * @property {string | null} [account]
 * @property {string | null} [month] YYYY-MM
 * @property {'month' | 'year' | null} [period] what Income & spending reads
 *   (ADR 0044): the month, the default and never written, or its calendar
 *   year
 * @property {string | null} [transaction]
 * @property {string | null} [category] a line of the month: a category id,
 *   or one of the Uncategorised lines (lib/domain/derive/finance.js)
 * @property {string | null} [tag] a tag of the period (ADR 0046), the
 *   user's own text, encoded by the address. One selection at a time:
 *   picking a tag clears the line, and picking a line clears the tag
 * @property {FinancesSpan | null} [span] how far the Transactions card's
 *   list reaches: with a tag selected, `all` lists every movement of the
 *   tag, whatever the period (ADR 0046); with nothing selected, every
 *   movement of the period rather than the newest (ADR 0048). Absent, the
 *   period's, capped
 *
 * There is no `chart` any more (ADR 0048): the net worth line left Income &
 * spending, and an old `?chart=` is read by nothing and never written again.
 */

/**
 * How far the Transactions card's list reaches (ADRs 0046, 0048): `all` of
 * a tag's movements whatever the period, or, with nothing selected, all of
 * the period's. The default -- the period's, the newest of it -- is never
 * written.
 *
 * @typedef {'all'} FinancesSpan
 */

/**
 * The order the Finances screen writes its parameters in.
 *
 * @type {(keyof FinancesPlace)[]}
 */
const PLACE_KEYS = ['account', 'month', 'period', 'category', 'tag', 'span', 'transaction'];

/** The values a place leaves out of the address: each parameter's default. */
const PLACE_DEFAULTS = /** @type {Partial<Record<keyof FinancesPlace, string>>} */ ({ period: 'month' });

/**
 * The span an address asks for: `?span=all` lists all of a tag's movements,
 * or all of the period's with nothing selected; anything else -- nothing,
 * an unknown value, the parameter twice -- the period's, capped.
 *
 * @param {string | string[] | undefined} value the `span` search parameter
 * @returns {FinancesSpan | null}
 */
export function financesSpan(value) {
  return value === 'all' ? 'all' : null;
}

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
 * The Review screen on the week starting at `monday` (ADR 0034).
 *
 * @param {string} monday day key of the week's first day
 * @returns {string}
 */
export function reviewAddress(monday) {
  return '/review?week=' + monday;
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
    if (value === PLACE_DEFAULTS[key]) continue;
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
