/**
 * A deposit's interest, as the lists show it (ADR 0056).
 *
 * A deposit pays interest every day, a few cents, and a statement writes it
 * as a movement a day -- and the tax withheld on it as a fee of its own
 * beside it (ADR 0041). Sixty rows a month say nothing one by one. This
 * module says which movements are interest, and folds a list's run of them
 * -- an account's interest movements of a month -- into one net row.
 *
 * Display only: nothing is stored, and no figure reads this. Every flow,
 * balance and column counts each movement as it always did; only the two
 * list derivations (`listedTransactions`, `lineMovements`) fold.
 *
 * Pure, plain Node.
 */

import { INTEREST_MOVEMENT_TYPES, limits, ORIGIN_SOURCES } from '../../../personalos.config.js';
import { monthOf } from '../dates.js';

/** @typedef {import('../types.js').Transaction} Transaction */

/**
 * An account's interest movements of a month, folded into one row of a list.
 *
 * @typedef {object} InterestRun
 * @property {'interest'} kind
 * @property {string} id `interest:<account id>:<month>`, stable for a list's key
 * @property {string} accountId
 * @property {string} month YYYY-MM
 * @property {string} date day key, the newest day of the run: where it sits
 *   in a list by date
 * @property {number} amount minor units, signed from the account's side: the
 *   net of what the list holds of the run -- interest less the tax withheld
 *   in the Transactions card, only what the line counts in a line's list
 * @property {number} count how many movements it folds
 * @property {number} days on how many days
 * @property {string[]} ids the movements it folds, in the list's order
 * @property {(string | null)[]} categoryIds each category its movements are
 *   filed under, once, in the list's order; null for none
 */

/** The words, in the case they are compared in. */
const WORDS = new Set(INTEREST_MOVEMENT_TYPES.map((word) => word.toLowerCase()));

/**
 * Whether a movement is a deposit's interest (ADR 0056): it came from a
 * statement and the statement's own movement type, which the importer keeps
 * (`origin.detail.type`), is one of the words a source uses for interest
 * (`INTEREST_MOVEMENT_TYPES`, ignoring case). The fee withheld on interest
 * carries the same type, with `part: 'fee'`, and is interest's too. A
 * movement typed by hand, or by any other source, never is: nothing but a
 * statement says so, and repeated purchases at one merchant never carry the
 * word.
 *
 * @param {Pick<Transaction, 'origin'>} transaction
 * @returns {boolean}
 */
export function isInterestMovement(transaction) {
  const origin = transaction.origin;
  if (origin === null || origin.source !== ORIGIN_SOURCES.statement) return false;
  const type = origin.detail?.type;
  return typeof type === 'string' && WORDS.has(type.trim().toLowerCase());
}

/**
 * Whether a list may fold a movement into its month's interest row: it is
 * interest, and it counts as a flow on its own date -- not a transfer, not a
 * movement not counted (which a list shows quieter), not one counted over
 * several months (which shows its months and its part).
 *
 * @param {Transaction} transaction
 * @returns {boolean}
 */
export function foldsAsInterest(transaction) {
  return (
    isInterestMovement(transaction) &&
    transaction.counterAccountId === null &&
    !transaction.notCounted &&
    (transaction.countedOver ?? null) === null
  );
}

/**
 * A list by date with each account's interest of a month as one row (ADR
 * 0056): the movements that fold as interest (foldsAsInterest), by account
 * and month, become one InterestRun when there are at least `min` of them in
 * the list; fewer stay as they are. The run sits where its newest movement
 * sat, so a list newest first stays newest first; everything else keeps its
 * place. `interest` counts the movements of the list in a run -- folded, or,
 * shown, that would be -- so a list can say so and offer them one by one.
 *
 * The list decides what a run holds: handed a line's movements, a run holds
 * only what the line counts, so a row never shows an amount its line does
 * not count.
 *
 * @param {Transaction[]} transactions a list, newest first
 * @param {{ min?: number, show?: boolean, keep?: (transaction: Transaction) => boolean }} [options]
 *   `min` the fewest movements a run folds (`limits.financeInterestRunMin`);
 *   `show` lists every movement as it is; `keep` a movement that stays a row
 *   of its own whatever it is (one end of a refund pair)
 * @returns {{ rows: (Transaction | InterestRun)[], interest: number }}
 */
export function foldInterest(transactions, { min = limits.financeInterestRunMin, show = false, keep = () => false } = {}) {
  /** @type {Map<string, Transaction[]>} */
  const runs = new Map();
  for (const transaction of transactions) {
    if (!foldsAsInterest(transaction) || keep(transaction)) continue;
    const key = runKey(transaction);
    runs.set(key, [...(runs.get(key) ?? []), transaction]);
  }
  for (const [key, run] of runs) {
    if (run.length < min) runs.delete(key);
  }
  const interest = [...runs.values()].reduce((count, run) => count + run.length, 0);
  if (show || runs.size === 0) return { rows: transactions, interest };

  /** @type {(Transaction | InterestRun)[]} */
  const rows = [];
  const placed = new Set();
  for (const transaction of transactions) {
    const key = runKey(transaction);
    const run = foldsAsInterest(transaction) && !keep(transaction) ? runs.get(key) : undefined;
    if (run === undefined) {
      rows.push(transaction);
      continue;
    }
    if (placed.has(key)) continue;
    placed.add(key);
    rows.push(summary(run));
  }
  return { rows, interest };
}

/** @param {Transaction} transaction */
function runKey(transaction) {
  return transaction.accountId + ':' + monthOf(transaction.date);
}

/**
 * @param {Transaction[]} run one account's interest of one month, in the list's order
 * @returns {InterestRun}
 */
function summary(run) {
  const first = run[0];
  const month = monthOf(first.date);
  return {
    kind: 'interest',
    id: 'interest:' + first.accountId + ':' + month,
    accountId: first.accountId,
    month,
    date: run.reduce((newest, row) => (row.date > newest ? row.date : newest), first.date),
    amount: run.reduce((sum, row) => sum + row.amount, 0),
    count: run.length,
    days: new Set(run.map((row) => row.date)).size,
    ids: run.map((row) => row.id),
    categoryIds: [...new Set(run.map((row) => row.categoryId))],
  };
}
