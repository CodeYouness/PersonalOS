/**
 * The review file (ADR 0043): what categorising proposes, as a CSV you read
 * and edit in a spreadsheet, and the only thing `--apply` reads besides the
 * data. One row per proposed transfer pair, then one per group of open
 * movements -- a merchant key and a direction.
 *
 * Columns, in order:
 *
 *   row            `transfer` or `group`
 *   key            the merchant key (key.js); empty on a transfer row
 *   direction      `out` or `in`; empty on a transfer row
 *   sample         one description, as the bank wrote it; on a transfer
 *                  row, the two, out first
 *   count          how many movements
 *   total          their signed sum; on a transfer row, the amount moved
 *   from, to       the first and last day
 *   accounts       the accounts they are on; on a transfer row "A -> B"
 *   bank_category  the bank's own category, when it gives one
 *   proposed       what is proposed, in the decision's words
 *   source         `transfer`, `rule`, `model`, or empty for none
 *   why            one line: how the proposal was reached, or why none was
 *   decision       YOURS TO EDIT, filled with the proposal: keep it, write
 *                  another category as "Parent > Child" or "Parent", add
 *                  " (not counted)" to a category, write "not counted"
 *                  alone, or empty it to skip the row. A transfer row takes
 *                  "transfer" or nothing.
 *   ids            the movements the row lists, space-separated; do not edit
 *
 * Only `row`, `key`, `direction`, `decision` and `ids` are read back; the
 * rest is for you. Saved by a spreadsheet, it must stay CSV with commas.
 */

import { formatCsv, parseCsvRecords } from '../csv.js';
import { formatMinor } from '../statement-import/money.js';
import { bankCategoryOf } from './key.js';
import { TRANSFER, decisionText } from './plan.js';

export const REVIEW_HEADER = Object.freeze([
  'row', 'key', 'direction', 'sample', 'count', 'total', 'from', 'to', 'accounts', 'bank_category', 'proposed', 'source', 'why', 'decision', 'ids',
]);

/**
 * @typedef {object} ReviewRow a row read back
 * @property {number} line the file's line it starts on, the header being 1
 * @property {'transfer' | 'group'} row
 * @property {string} key
 * @property {'in' | 'out' | ''} direction
 * @property {string} decision as written
 * @property {string[]} ids
 */

/**
 * @param {import('./plan.js').ProposalPlan} plan
 * @param {import('../../lib/domain/types.js').FinanceCategory[]} categories
 * @param {import('../../lib/domain/types.js').FinanceAccount[]} accounts
 * @returns {string} the file's text
 */
export function formatReview(plan, categories, accounts) {
  /** @param {string} id */
  const accountName = (id) => accounts.find((account) => account.id === id)?.name ?? id;
  /** @type {string[][]} */
  const rows = [[...REVIEW_HEADER]];
  for (const { out, into, distance, confirmed } of plan.transfers) {
    const days = [out.date, into.date].sort();
    rows.push([
      'transfer',
      '',
      '',
      out.description + ' / ' + into.description,
      '2',
      formatMinor(into.amount),
      days[0],
      days[1],
      accountName(out.accountId) + ' -> ' + accountName(into.accountId),
      '',
      TRANSFER,
      'transfer',
      (distance === 0 ? 'same day' : distance + ' day(s) apart') + '; ' +
        (confirmed ? "the bank's movement type says transfer" : 'amount and dates only: the movement type says nothing'),
      TRANSFER,
      out.id + ' ' + into.id,
    ]);
  }
  for (const group of plan.groups) {
    const proposed = group.proposal === null ? '' : decisionText(group.proposal, categories);
    const bankCategories = [...new Set(group.movements.map((transaction) => bankCategoryOf(transaction.origin?.detail)).filter((text) => text !== ''))];
    rows.push([
      'group',
      group.key,
      group.direction,
      group.movements[0].description,
      String(group.movements.length),
      formatMinor(group.movements.reduce((sum, transaction) => sum + transaction.amount, 0)),
      group.movements[0].date,
      /** @type {import('../../lib/domain/types.js').Transaction} */ (group.movements.at(-1)).date,
      [...new Set(group.movements.map((transaction) => accountName(transaction.accountId)))].join('; '),
      bankCategories.join('; '),
      proposed,
      group.source,
      group.why,
      proposed,
      group.movements.map((transaction) => transaction.id).join(' '),
    ]);
  }
  return formatCsv(rows);
}

/**
 * The file read back. A header that is not the review's throws: nothing
 * else in the file can be trusted to mean what it says. A row that cannot
 * be read is a problem with its line, and blocks the write.
 *
 * @param {string} text
 * @returns {{ rows: ReviewRow[], problems: { line: number, reason: string }[] }}
 */
export function readReview(text) {
  const [header, ...records] = parseCsvRecords(text);
  const names = (header?.cells ?? []).map((cell) => cell.trim());
  const missing = REVIEW_HEADER.filter((name) => !names.includes(name));
  const unexpected = names.filter((name) => !REVIEW_HEADER.includes(name));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      "the file's header is not a review file's" + (missing.length > 0 ? '; missing: ' + missing.join(', ') : '') +
        (unexpected.length > 0 ? '; not expected: ' + unexpected.join(', ') : '') +
        ' -- if a spreadsheet saved it, save it as CSV with commas'
    );
  }
  /** @param {string[]} cells @param {string} name */
  const cell = (cells, name) => (cells[names.indexOf(name)] ?? '').trim();

  /** @type {ReviewRow[]} */
  const rows = [];
  /** @type {{ line: number, reason: string }[]} */
  const problems = [];
  for (const { line, cells } of records) {
    const kind = cell(cells, 'row');
    const direction = cell(cells, 'direction');
    const ids = cell(cells, 'ids').split(/\s+/).filter((id) => id !== '');
    if (kind !== 'transfer' && kind !== 'group') {
      problems.push({ line, reason: 'row is "' + kind + '", neither transfer nor group' });
      continue;
    }
    if (kind === 'group' && direction !== 'in' && direction !== 'out') {
      problems.push({ line, reason: 'direction is "' + direction + '", neither in nor out' });
      continue;
    }
    if (kind === 'group' && cell(cells, 'key') === '') {
      problems.push({ line, reason: 'a group row has no key' });
      continue;
    }
    rows.push({
      line,
      row: kind,
      key: cell(cells, 'key'),
      direction: kind === 'group' ? /** @type {'in' | 'out'} */ (direction) : '',
      decision: cell(cells, 'decision'),
      ids,
    });
  }
  return { rows, problems };
}
