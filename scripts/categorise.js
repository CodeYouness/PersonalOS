#!/usr/bin/env node
/**
 * Categorises the statement movements nothing has described yet (roadmap
 * stage 2, ADR 0043), in two steps, so the model is asked at most once and
 * what is written is exactly what you reviewed.
 *
 *   npm run data:categorise -- --review <file.csv> [--model] [--window <days>]
 *
 * Proposes, writing nothing to your data: transfers between your own
 * accounts (opposite amounts on two cash accounts within the window, 2 days
 * by default), then a category learned from the movements already
 * categorised under the same merchant key, then -- only with --model, and
 * only when a key is set -- the model's pick for the keys still without one.
 * It writes the review file at <file.csv>, which must not exist yet, and
 * prints what it proposed, by source, what stays open, and spending and
 * income before and after over the days the open movements cover.
 *
 *   npm run data:categorise -- --apply <file.csv> [--write]
 *
 * Reads the reviewed file, checks every decision -- a category that does not
 * exist blocks, with its line -- and resolves each row against the data now:
 * a transfer row to its two movements, a group row to every open movement of
 * its key and direction, those imported since included. A dry run by
 * default: what would be filled, what was categorised since and is left
 * alone, and the totals before and after. With --write, after a backup, it
 * fills exactly that -- the category and the not-counted flag, only where
 * empty -- and a second run changes nothing and takes no backup.
 *
 * Proposing reads the data and may run beside `npm run serve`. Stop `serve`
 * (and `dev`, if running) before --write: like every data script it does not
 * take the writer lock (ADR 0032). The review file holds your merchants and
 * amounts: keep it out of the repository.
 */

// First: the key in .env.local must be in the environment before
// lib/config/env.js reads it.
import './categorise/env-files.js';
import '../lib/config/env.js';
import { access, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { getAccounts, getProfile, getTransactions } from '../lib/store.js';
import { bankCategoryOf, maskDigits } from './categorise/key.js';
import { proposeByModel } from './categorise/model.js';
import {
  DEFAULT_WINDOW_DAYS,
  MAX_WINDOW_DAYS,
  NOT_COUNTED,
  TRANSFER,
  categoryPath,
  planApply,
  planProposals,
  proposedPatches,
  totalsBeforeAfter,
} from './categorise/plan.js';
import { formatReview, readReview } from './categorise/review.js';
import { writeChanges } from './categorise/write.js';
import { formatMinor } from './statement-import/money.js';

/**
 * @typedef {object} CategoriseOptions
 * @property {'review' | 'apply'} mode
 * @property {string} path the review file
 * @property {boolean} [model] review only: ask the model for the keys no rule covers
 * @property {number} [window] review only: days apart a transfer's legs may be
 * @property {boolean} [write] apply only
 */

/** The ambiguous movements and disagreeing keys the report prints before "and N more". */
const MAX_LISTED = 30;

/** The blocking lines the report prints before "and N more". */
const MAX_BLOCKING_SHOWN = 10;

/**
 * Phase A: proposes, writes the review file, writes nothing to your data.
 *
 * @param {{ path: string, model?: boolean, window?: number, print?: (line: string) => void }} options
 */
export async function proposeCategories({ path, model = false, window = DEFAULT_WINDOW_DAYS, print = (line) => console.log(line) }) {
  if (await exists(path)) throw new Error(path + ' already exists: it may hold your decisions. Name another file, or delete it first');
  const [accounts, transactions, profile] = await Promise.all([getAccounts(), getTransactions(), getProfile()]);
  const categories = profile.financeCategories;
  const plan = planProposals({ transactions, accounts, categories, window });

  /** @type {import('./categorise/model.js').ModelResult | { outcome: 'off' }} */
  let asked = { outcome: 'off' };
  let againstDirection = 0;
  if (model) {
    const pending = plan.groups.filter((group) => group.proposal === null && group.conflict === null);
    asked = await proposeByModel(
      pending.map((group) => ({
        key: group.key,
        direction: group.direction,
        sample: maskDigits(group.movements[0].description),
        bankCategory: bankCategoryOf(group.movements.find((transaction) => bankCategoryOf(transaction.origin?.detail) !== '')?.origin?.detail),
      })),
      categories
    );
    if (asked.outcome === 'asked') {
      for (const [index, categoryId] of asked.answers) {
        const group = pending[index];
        // Money in under a spending category counts as a refund, money out
        // under an income one as a chargeback (ADR 0023): a wrong guess moves
        // both totals, so it is shown, never pre-filled.
        const kind = kindOf(categoryId, categories);
        if ((group.direction === 'in') !== (kind === 'income')) {
          againstDirection += 1;
          const counts = group.direction === 'in' ? 'money in under a spending category counts as a refund' : 'money out under an income category counts as a chargeback';
          group.why = 'the model suggested "' + categoryPath(categoryId, categories) + '", not proposed: ' + counts + ' -- write it in the decision to accept' + (group.why === '' ? '' : '; ' + group.why);
          continue;
        }
        group.proposal = { categoryId, notCounted: false };
        group.source = 'model';
        group.why = 'proposed by the model' + (group.why === '' ? '' : '; ' + group.why);
      }
    }
  }

  await writeFile(path, formatReview(plan, categories, accounts), { flag: 'wx' });
  const totals = totalsBeforeAfter(transactions, categories, plan.open, proposedPatches(plan));
  for (const line of describeProposals(plan, asked, totals, categories, accounts, path, againstDirection)) print(line);
  return { plan, model: asked, againstDirection };
}

/**
 * The proposing report, line by line. Printed to the terminal only: it holds
 * your merchants and amounts.
 *
 * @param {import('./categorise/plan.js').ProposalPlan} plan
 * @param {import('./categorise/model.js').ModelResult | { outcome: 'off' }} asked
 * @param {ReturnType<typeof totalsBeforeAfter>} totals
 * @param {import('../lib/domain/types.js').FinanceCategory[]} categories
 * @param {import('../lib/domain/types.js').FinanceAccount[]} accounts
 * @param {string} path
 * @param {number} [againstDirection] model answers shown, not proposed
 * @returns {string[]}
 */
export function describeProposals(plan, asked, totals, categories, accounts, path, againstDirection = 0) {
  /** @param {string} id */
  const accountName = (id) => accounts.find((account) => account.id === id)?.name ?? id;
  const lines = ['Categorise, propose -- the review file is written; nothing in your data was changed.', ''];
  if (plan.range === null) {
    lines.push('No open statement movement: every one has a category, a counter account or is not counted.');
  } else {
    lines.push('Open statement movements (no category, no counter account, counted): ' + plan.open.length + ', from ' + plan.range.from + ' to ' + plan.range.to + '.');
  }

  // Transfers.
  /** @type {Record<number, number>} */
  const byDistance = {};
  for (const pair of plan.transfers) byDistance[pair.distance] = (byDistance[pair.distance] ?? 0) + 1;
  const distances = Object.keys(byDistance).map(Number).sort((a, b) => a - b);
  lines.push(
    '',
    'Transfers between your own accounts, window ' + plan.window + ' day(s): ' + plan.transfers.length + ' pair(s) proposed' +
      (distances.length === 0 ? '' : ' (' + distances.map((days) => (days === 0 ? 'same day' : days + ' day(s) apart') + ': ' + byDistance[days]).join(', ') + ')') +
      ', ' + plan.transfers.filter((pair) => pair.confirmed).length + " confirmed by the bank's movement type"
  );
  lines.push('  on a cash account, ruled out by their movement type (a card payment, a fee, interest...): ' + plan.excluded);
  lines.push('  more than one equally good partner, none paired: ' + plan.ambiguous.length);
  for (const transaction of plan.ambiguous.slice(0, MAX_LISTED)) {
    lines.push('    ' + transaction.date + '  ' + formatMinor(transaction.amount).padStart(12) + '  ' + accountName(transaction.accountId) + '  "' + transaction.description + '"');
  }
  if (plan.ambiguous.length > MAX_LISTED) lines.push('    and ' + (plan.ambiguous.length - MAX_LISTED) + ' more');

  // Groups by source.
  /** @param {import('./categorise/plan.js').Group[]} groups */
  const size = (groups) => groups.length + ' group(s), ' + groups.reduce((sum, group) => sum + group.movements.length, 0) + ' movement(s)';
  const byRule = plan.groups.filter((group) => group.source === 'rule');
  const byModel = plan.groups.filter((group) => group.source === 'model');
  const conflicts = plan.groups.filter((group) => group.conflict !== null);
  const still = plan.groups.filter((group) => group.proposal === null);
  lines.push('', 'Groups -- one merchant key, one direction: ' + size(plan.groups));
  lines.push('  proposed by a rule learned from what is categorised: ' + size(byRule));
  lines.push(
    '  proposed by the model: ' +
      (asked.outcome === 'off' ? 'not asked (run with --model to ask)' :
        asked.outcome === 'no-model' ? 'not asked: no ANTHROPIC_API_KEY' :
        size(byModel))
  );
  lines.push('  keys whose categorised movements disagree, nothing proposed: ' + conflicts.length);
  for (const group of conflicts.slice(0, MAX_LISTED)) {
    lines.push(
      '    "' + group.key + '" (' + group.direction + '): ' +
        (group.conflict ?? []).map(({ categoryId, count }) => categoryPath(categoryId, categories) + ' ' + count).join(', ')
    );
  }
  if (conflicts.length > MAX_LISTED) lines.push('    and ' + (conflicts.length - MAX_LISTED) + ' more');
  lines.push('  still open, nothing proposed: ' + size(still));

  if (asked.outcome === 'asked') {
    lines.push(
      '',
      'Model: ' + asked.calls + ' call(s) about ' + asked.keys + ' key(s); ' +
        asked.answers.size + ' proposed, ' + asked.declined + ' with no category that fits, ' + asked.dropped + ' answer(s) dropped (a key or an id it was not sent)'
    );
    if (againstDirection > 0) {
      lines.push('  ' + againstDirection + ' of the proposed go against the direction of the money (a refund or a chargeback): shown in the why column, not pre-filled');
    }
    if (asked.failedCalls > 0) {
      lines.push('  ' + asked.failedCalls + ' call(s) failed; their ' + asked.failedItems + ' key(s) stay without a proposal:');
      for (const error of asked.errors) lines.push('    ' + error);
    }
  }

  describeTotals(lines, totals, 'if every proposal is kept');

  lines.push(
    '',
    'Review written to ' + path + '.',
    'Edit its decision column: keep the proposal, write another category as "Parent > Child" or "Parent", add " (' + NOT_COUNTED + ')" to one, ' +
      'write "' + NOT_COUNTED + '" alone, or empty it to skip the row; a transfer row takes "' + TRANSFER + '" or nothing. Then:',
    '  npm run data:categorise -- --apply ' + path + '            (a dry run)',
    '  npm run data:categorise -- --apply ' + path + ' --write'
  );
  return lines;
}

/**
 * @param {string[]} lines
 * @param {ReturnType<typeof totalsBeforeAfter>} totals
 * @param {string} afterLabel
 */
function describeTotals(lines, totals, afterLabel) {
  if (totals === null) return;
  lines.push('', 'Spending and income on every account, ' + totals.from + ' to ' + totals.to + ':');
  /** @param {string} label @param {import('./categorise/plan.js').Totals} row */
  const line = (label, row) =>
    '  ' + label.padEnd(28) + 'spending ' + formatMinor(row.spending).padStart(12) + '   income ' + formatMinor(row.income).padStart(12) +
    '   of them uncategorised: spending ' + formatMinor(row.uncategorisedSpending) + ', income ' + formatMinor(row.uncategorisedIncome);
  lines.push(line('before', totals.before), line(afterLabel, totals.after));
}

/**
 * Phase B: applies a reviewed file; a dry run unless `write`.
 *
 * @param {{ path: string, write?: boolean, print?: (line: string) => void }} options
 * @returns {Promise<{ plan: import('./categorise/plan.js').ApplyPlan, blocking: string[], backupPath?: string }>}
 */
export async function applyReview({ path, write = false, print = (line) => console.log(line) }) {
  const review = readReview(await readFile(path, 'utf8'));
  const [transactions, profile] = await Promise.all([getTransactions(), getProfile()]);
  const categories = profile.financeCategories;
  const plan = planApply({ review, transactions, categories });
  const patches = new Map(plan.changes.map((change) => [change.transaction.id, change.patch]));
  const totals = totalsBeforeAfter(transactions, categories, plan.changes.map((change) => change.transaction), patches);

  if (!write) {
    for (const line of describeApply(plan, totals, 'dry run: nothing was written.')) print(line);
    return { plan, blocking: plan.blocking };
  }
  const { backupPath, written } = await writeChanges(plan, print);
  if (backupPath !== undefined) {
    for (const line of describeApply(plan, totals, 'written.')) print(line);
    print('');
    print('Filled ' + written + ' movement(s).');
  }
  return { plan, blocking: plan.blocking, backupPath };
}

/**
 * The applying report, line by line.
 *
 * @param {import('./categorise/plan.js').ApplyPlan} plan
 * @param {ReturnType<typeof totalsBeforeAfter>} totals
 * @param {string} outcome
 * @returns {string[]}
 */
export function describeApply(plan, totals, outcome) {
  const lines = ['Categorise, apply -- ' + outcome, ''];
  const { transfers, groups } = plan;
  lines.push(
    'Transfer rows: ' + transfers.accepted + ' accepted, ' + transfers.rejected + ' rejected (decision emptied), ' + transfers.skipped.length + ' skipped.'
  );
  for (const skipped of transfers.skipped) lines.push('  line ' + skipped.line + ': ' + skipped.reason);
  lines.push('Group rows: ' + groups.decided + ' decided, ' + groups.skipped + ' skipped (decision empty).');

  const category = plan.changes.filter((change) => change.patch.categoryId !== undefined).length;
  const notCounted = plan.changes.filter((change) => change.patch.notCounted === true).length;
  lines.push(
    '',
    'Movements to fill: ' + plan.changes.length + ' -- a category on ' + category + ', not counted on ' + notCounted + '.',
    '  not listed in their row -- imported since the review, or a transfer you rejected: ' + plan.newSince,
    '  listed, but categorised, made a transfer or not counted since -- left alone: ' + plan.leftAlone,
    '  listed, no longer there: ' + plan.gone
  );

  describeTotals(lines, totals, 'after');

  if (plan.blocking.length > 0) {
    lines.push('', 'Blocking -- --write is refused until these are resolved:');
    const shown = plan.blocking.length > MAX_BLOCKING_SHOWN ? [...plan.blocking.slice(0, MAX_BLOCKING_SHOWN), 'and ' + (plan.blocking.length - MAX_BLOCKING_SHOWN) + ' more'] : plan.blocking;
    for (const entry of shown) lines.push('  ' + entry);
  }
  lines.push(
    '',
    plan.blocking.length > 0 ? 'The apply would be refused: ' + plan.blocking.length + ' problem(s).' :
      plan.changes.length === 0 ? 'Nothing to change: the review is already applied.' :
      'Nothing blocks the apply.'
  );
  return lines;
}

/**
 * Whether a category counts as income or spending: a subcategory takes its
 * parent's kind.
 *
 * @param {string} categoryId
 * @param {import('../lib/domain/types.js').FinanceCategory[]} categories
 * @returns {'income' | 'spending'}
 */
function kindOf(categoryId, categories) {
  const category = categories.find((row) => row.id === categoryId);
  const top = category?.parentId ? categories.find((row) => row.id === category.parentId) : category;
  return top?.kind === 'income' ? 'income' : 'spending';
}

/** @param {string} path */
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * The command line, read strictly: an unknown flag, a missing value or a
 * flag the phase does not take is an error, never ignored.
 *
 * @param {string[]} args
 * @returns {CategoriseOptions}
 */
export function parseArgs(args) {
  /** @type {{ review?: string, apply?: string, model: boolean, window?: number, write: boolean }} */
  const read = { model: false, write: false };
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at];
    const value = () => {
      const next = args[at + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(arg + ' needs a value');
      at += 1;
      return next;
    };
    if (arg === '--review') read.review = value();
    else if (arg === '--apply') read.apply = value();
    else if (arg === '--model') read.model = true;
    else if (arg === '--write') read.write = true;
    else if (arg === '--window') {
      const text = value();
      if (!/^\d+$/.test(text) || Number(text) > MAX_WINDOW_DAYS) throw new Error('--window takes a whole number of days from 0 to ' + MAX_WINDOW_DAYS + ', received ' + text);
      read.window = Number(text);
    } else throw new Error(arg.startsWith('--') ? 'unknown option ' + arg : 'unexpected argument ' + arg + ': name the file with --review or --apply');
  }
  if ((read.review === undefined) === (read.apply === undefined)) throw new Error('name one file: --review <file.csv> to propose, or --apply <file.csv> to apply');
  if (read.review !== undefined) {
    if (read.write) throw new Error('--write goes with --apply: proposing writes only the review file');
    return { mode: 'review', path: read.review, model: read.model, window: read.window ?? DEFAULT_WINDOW_DAYS };
  }
  if (read.model || read.window !== undefined) throw new Error('--model and --window go with --review: applying reads only the file');
  return { mode: 'apply', path: /** @type {string} */ (read.apply), write: read.write };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  /** @type {CategoriseOptions} */
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error instanceof Error ? error.message : String(error)) + '\n');
    console.error('usage: npm run data:categorise -- --review <file.csv> [--model] [--window <days>]');
    console.error('       npm run data:categorise -- --apply <file.csv> [--write]');
    process.exit(1);
  }
  try {
    if (options.mode === 'review') await proposeCategories({ path: options.path, model: options.model, window: options.window });
    else await applyReview({ path: options.path, write: options.write });
  } catch (error) {
    console.error('categorise refused: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
