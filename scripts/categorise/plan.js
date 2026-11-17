/**
 * Categorising's plans (ADR 0043), computed from the data as it stands
 * without writing anything. Pure: the entry point reads the store and hands
 * its rows in, so what is proposed, what the dry run prints and what is
 * written cannot disagree.
 *
 * An **open** movement is a statement movement with no category, no counter
 * account, and counted: one nothing has said anything about yet.
 *
 * Proposing, in order -- the first that proposes wins:
 *
 *   1. Transfers between your own accounts. Two open movements on two
 *      different cash accounts, in one currency, of exactly opposite
 *      amounts, dated within the window, neither of a movement type that
 *      rules it out (key.js, transferEvidence). Matched one to one, the
 *      nearest first: every same-day pair before any a day apart. At each
 *      distance, a movement with more than one partner pairs with none, and
 *      neither do its partners: they are listed as ambiguous. A false
 *      transfer hides real spending, so a doubt pairs nothing.
 *   2. Rules learned from what is already categorised. Every statement
 *      movement with a category says "this key is that category". A key
 *      whose categorised movements all agree proposes their category for
 *      the open movements of that key, in either direction -- and not
 *      counted when all of them are not counted. A key that disagrees
 *      proposes nothing and is reported.
 *   3. The model, for the groups still without a proposal and with no
 *      disagreement (model.js), only when asked.
 *
 * Applying reads the reviewed file back (review.js) and resolves each row
 * against the data as it stands now: a transfer row to its two movements,
 * both still open; a group row to every open movement of its key and
 * direction, those it listed and those imported since. It fills only what is
 * empty -- the category, the not-counted flag -- on movements still open:
 * one that gained a category, a counter account or the flag since is left
 * alone, and a note or a tag is never touched.
 */

import { ORIGIN_SOURCES } from '../../personalos.config.js';
import { totalsBetween } from '../../lib/domain/derive/finance.js';
import { daysApart } from '../ledger-import/plan.js';
import { BLANK_KEY, directionOf, merchantKey, transferEvidence } from './key.js';

/** How many days apart the two legs of a transfer may be, by default. */
export const DEFAULT_WINDOW_DAYS = 2;

/** The largest window accepted: past a week, an opposite amount is a coincidence. */
export const MAX_WINDOW_DAYS = 7;

/** The decision word for "neither spending nor income". */
export const NOT_COUNTED = 'not counted';

/** The decision word that accepts a transfer row. */
export const TRANSFER = 'transfer';

/**
 * @typedef {import('../../lib/domain/types.js').FinanceAccount} FinanceAccount
 * @typedef {import('../../lib/domain/types.js').FinanceCategory} FinanceCategory
 * @typedef {import('../../lib/domain/types.js').Transaction} Transaction
 *
 * @typedef {object} Proposal what a group would be given
 * @property {string | null} categoryId
 * @property {boolean} notCounted
 *
 * @typedef {object} Group the open movements of one key and direction
 * @property {string} key
 * @property {'in' | 'out'} direction
 * @property {Transaction[]} movements oldest first
 * @property {Proposal | null} proposal
 * @property {'rule' | 'model' | ''} source
 * @property {string} why one line for the review file
 * @property {{ categoryId: string, count: number }[] | null} conflict the categories the key's
 *   categorised movements disagree on, most used first; null when they agree or there are none
 *
 * @typedef {object} TransferPair
 * @property {Transaction} out
 * @property {Transaction} into
 * @property {number} distance days apart
 * @property {boolean} confirmed a leg's movement type says transfer
 *
 * @typedef {object} ProposalPlan
 * @property {number} window
 * @property {Transaction[]} open oldest first
 * @property {{ from: string, to: string } | null} range the open movements' first and last day
 * @property {TransferPair[]} transfers
 * @property {Transaction[]} ambiguous open movements with more than one equally good partner
 * @property {number} excluded open movements on cash accounts whose movement type rules out a transfer
 * @property {Group[]} groups the open movements not in a pair
 */

/**
 * Whether nothing has been said about a statement movement yet.
 *
 * @param {Transaction} transaction
 * @returns {boolean}
 */
export function isOpen(transaction) {
  return (
    transaction.origin?.source === ORIGIN_SOURCES.statement &&
    transaction.categoryId === null &&
    transaction.counterAccountId === null &&
    !transaction.notCounted
  );
}

/** @param {Transaction} a @param {Transaction} b */
function byDate(a, b) {
  return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
}

/**
 * @param {{ transactions: Transaction[], accounts: FinanceAccount[], categories: FinanceCategory[], window: number }} input
 * @returns {ProposalPlan}
 */
export function planProposals({ transactions, accounts, categories, window }) {
  const open = transactions.filter(isOpen).sort(byDate);
  const range = open.length === 0 ? null : { from: open[0].date, to: /** @type {Transaction} */ (open.at(-1)).date };
  const { pairs, ambiguous, excluded } = pairTransfers(open, accounts, window);
  const paired = new Set(pairs.flatMap((pair) => [pair.out, pair.into]));

  /** @type {Map<string, Group>} */
  const byKey = new Map();
  for (const transaction of open) {
    if (paired.has(transaction)) continue;
    const key = merchantKey(transaction);
    const direction = directionOf(transaction.amount);
    const id = key + '\n' + direction;
    let group = byKey.get(id);
    if (group === undefined) {
      group = { key, direction, movements: [], proposal: null, source: '', why: '', conflict: null };
      byKey.set(id, group);
    }
    group.movements.push(transaction);
  }
  const groups = [...byKey.values()].sort(
    (a, b) => b.movements.length - a.movements.length || a.key.localeCompare(b.key) || (a.direction === b.direction ? 0 : a.direction === 'out' ? -1 : 1)
  );

  const rules = learnRules(transactions);
  for (const group of groups) {
    const rule = rules.get(group.key);
    if (rule === undefined) continue;
    if (rule.length > 1) {
      group.conflict = rule.map(({ categoryId, count }) => ({ categoryId, count }));
      group.why = 'categorised before as ' + rule.map(({ categoryId, count }) => categoryPath(categoryId, categories) + ' (' + count + ')').join(', ') + ': nothing proposed';
      continue;
    }
    const [{ categoryId, count, notCounted }] = rule;
    const category = categories.find((row) => row.id === categoryId);
    if (category === undefined || isArchived(category, categories)) {
      group.why = 'categorised before as ' + categoryPath(categoryId, categories) + ', which is ' + (category === undefined ? 'gone' : 'archived') + ': nothing proposed';
      continue;
    }
    group.proposal = { categoryId, notCounted: notCounted === count };
    group.source = 'rule';
    group.why = count + ' categorised movement(s) with this key agree';
  }

  return { window, open, range, transfers: pairs, ambiguous, excluded, groups };
}

/**
 * The transfer pairs among the open movements (rule 1 above).
 *
 * @param {Transaction[]} open
 * @param {FinanceAccount[]} accounts
 * @param {number} window
 * @returns {{ pairs: TransferPair[], ambiguous: Transaction[], excluded: number }}
 */
export function pairTransfers(open, accounts, window) {
  const cash = new Set(accounts.filter((account) => account.kind === 'cash').map((account) => account.id));
  const legs = open.filter((transaction) => cash.has(transaction.accountId));
  const eligible = legs.filter((transaction) => transferEvidence(transaction.origin?.detail) !== 'excluded');
  const outs = eligible.filter((transaction) => transaction.amount < 0);
  const ins = eligible.filter((transaction) => transaction.amount > 0);

  /** @type {{ out: Transaction, into: Transaction, distance: number }[]} */
  const edges = [];
  for (const out of outs) {
    for (const into of ins) {
      if (into.accountId === out.accountId || into.amount !== -out.amount || into.currency !== out.currency) continue;
      const distance = daysApart(out.date, into.date, window);
      if (distance !== null) edges.push({ out, into, distance });
    }
  }

  /** @type {TransferPair[]} */
  const pairs = [];
  /** @type {Set<Transaction>} */
  const ambiguous = new Set();
  /** @type {Set<Transaction>} */
  const claimed = new Set();
  for (let distance = 0; distance <= window; distance += 1) {
    const live = edges.filter((edge) => edge.distance === distance && !claimed.has(edge.out) && !claimed.has(edge.into));
    /** @type {Map<Transaction, number>} */
    const degree = new Map();
    for (const { out, into } of live) {
      degree.set(out, (degree.get(out) ?? 0) + 1);
      degree.set(into, (degree.get(into) ?? 0) + 1);
    }
    for (const { out, into } of live) {
      if (degree.get(out) === 1 && degree.get(into) === 1) {
        const confirmed = [out, into].some((leg) => transferEvidence(leg.origin?.detail) === 'confirmed');
        pairs.push({ out, into, distance, confirmed });
      } else {
        ambiguous.add(out);
        ambiguous.add(into);
      }
    }
    // Every end of a live edge is now paired or ambiguous: neither is
    // offered a partner further away.
    for (const { out, into } of live) {
      claimed.add(out);
      claimed.add(into);
    }
  }
  pairs.sort((a, b) => byDate(a.out, b.out));
  return { pairs, ambiguous: [...ambiguous].sort(byDate), excluded: legs.length - eligible.length };
}

/**
 * What the statement movements already categorised say about each key: the
 * categories used, most used first, and how many of each were not counted.
 * A blank key says nothing about anyone and teaches nothing.
 *
 * @param {Transaction[]} transactions
 * @returns {Map<string, { categoryId: string, count: number, notCounted: number }[]>}
 */
export function learnRules(transactions) {
  /** @type {Map<string, Map<string, { count: number, notCounted: number }>>} */
  const byKey = new Map();
  for (const transaction of transactions) {
    if (transaction.origin?.source !== ORIGIN_SOURCES.statement || transaction.categoryId === null) continue;
    const key = merchantKey(transaction);
    if (key === BLANK_KEY) continue;
    const categories = byKey.get(key) ?? new Map();
    byKey.set(key, categories);
    const entry = categories.get(transaction.categoryId) ?? { count: 0, notCounted: 0 };
    entry.count += 1;
    if (transaction.notCounted) entry.notCounted += 1;
    categories.set(transaction.categoryId, entry);
  }
  /** @type {Map<string, { categoryId: string, count: number, notCounted: number }[]>} */
  const rules = new Map();
  for (const [key, categories] of byKey) {
    rules.set(
      key,
      [...categories].map(([categoryId, entry]) => ({ categoryId, ...entry })).sort((a, b) => b.count - a.count || a.categoryId.localeCompare(b.categoryId))
    );
  }
  return rules;
}

/**
 * A category as the review file names it: "Parent > Child", or "Parent".
 * One that no longer exists is named by its id, so a report never hides it.
 *
 * @param {string} categoryId
 * @param {FinanceCategory[]} categories
 * @returns {string}
 */
export function categoryPath(categoryId, categories) {
  const category = categories.find((row) => row.id === categoryId);
  if (category === undefined) return '(category ' + categoryId + ')';
  if (category.parentId === null) return category.name;
  const parent = categories.find((row) => row.id === category.parentId);
  return (parent?.name ?? '(category ' + category.parentId + ')') + ' > ' + category.name;
}

/**
 * Archived, itself or through its parent.
 *
 * @param {FinanceCategory} category
 * @param {FinanceCategory[]} categories
 * @returns {boolean}
 */
export function isArchived(category, categories) {
  if (category.archived) return true;
  if (category.parentId === null) return false;
  return categories.find((row) => row.id === category.parentId)?.archived ?? true;
}

/**
 * A proposal as the decision column writes it: "Parent > Child", "Parent >
 * Child (not counted)", or "not counted".
 *
 * @param {Proposal} proposal
 * @param {FinanceCategory[]} categories
 * @returns {string}
 */
export function decisionText(proposal, categories) {
  if (proposal.categoryId === null) return NOT_COUNTED;
  return categoryPath(proposal.categoryId, categories) + (proposal.notCounted ? ' (' + NOT_COUNTED + ')' : '');
}

/**
 * What a decision says, checked against the categories as they are:
 * nothing (empty: skip the row), a category, not counted, or both. A path
 * is "Parent" or "Parent > Child", compared without regard to case or
 * spacing; one that does not exist, names two categories or is archived is
 * an error. "transfer" is a transfer row's word, never a group's: a group
 * has no other account to name.
 *
 * @param {string} text
 * @param {FinanceCategory[]} categories
 * @returns {{ kind: 'skip' } | { kind: 'set', proposal: Proposal } | { kind: 'error', reason: string }}
 */
export function resolveDecision(text, categories) {
  const decision = text.trim().replace(/\s+/g, ' ');
  if (decision === '') return { kind: 'skip' };
  if (decision.toLowerCase() === NOT_COUNTED) return { kind: 'set', proposal: { categoryId: null, notCounted: true } };
  if (decision.toLowerCase() === TRANSFER) {
    return { kind: 'error', reason: '"' + TRANSFER + '" is for a transfer row; a group of movements has no other account to name' };
  }
  const suffix = new RegExp('^(.*?)\\s*\\(' + NOT_COUNTED + '\\)$', 'i').exec(decision);
  const path = suffix === null ? decision : suffix[1];
  const found = categoryByPath(path, categories);
  if ('reason' in found) return { kind: 'error', reason: found.reason };
  return { kind: 'set', proposal: { categoryId: found.id, notCounted: suffix !== null } };
}

/**
 * @param {string} path
 * @param {FinanceCategory[]} categories
 * @returns {{ id: string } | { reason: string }}
 */
function categoryByPath(path, categories) {
  const parts = path.split('>').map((part) => part.trim());
  if (parts.length > 2 || parts.some((part) => part === '')) {
    return { reason: '"' + path + '" is not a category: write "Parent > Child", "Parent", "' + NOT_COUNTED + '" or nothing' };
  }
  /** @param {string} a @param {string} b */
  const same = (a, b) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.toLowerCase();
  const tops = categories.filter((row) => row.parentId === null && same(row.name, parts[0]));
  if (tops.length === 0) return { reason: 'no category "' + parts[0] + '"' };
  if (tops.length > 1) return { reason: 'two categories are named "' + parts[0] + '": rename one' };
  let found = tops[0];
  if (parts.length === 2) {
    const children = categories.filter((row) => row.parentId === tops[0].id && same(row.name, parts[1]));
    if (children.length === 0) return { reason: 'no category "' + parts[1] + '" under "' + tops[0].name + '"' };
    if (children.length > 1) return { reason: 'two categories under "' + tops[0].name + '" are named "' + parts[1] + '": rename one' };
    found = children[0];
  }
  if (isArchived(found, categories)) return { reason: '"' + categoryPath(found.id, categories) + '" is archived: restore it, or choose another' };
  return { id: found.id };
}

/**
 * @typedef {import('./review.js').ReviewRow} ReviewRow
 *
 * @typedef {object} PlannedChange
 * @property {Transaction} transaction as it stands, open
 * @property {{ categoryId?: string, notCounted?: true }} patch only empty fields
 * @property {number} line the review row it comes from
 * @property {boolean} isNew not listed in the row: imported, or reopened, since the review was made
 *
 * @typedef {object} ApplyPlan
 * @property {PlannedChange[]} changes
 * @property {{ accepted: number, rejected: number, skipped: { line: number, reason: string }[] }} transfers
 * @property {{ decided: number, skipped: number }} groups
 * @property {number} newSince movements filled that the review did not list
 * @property {number} leftAlone listed movements categorised, made a transfer or not counted since
 * @property {number} gone listed movements no longer in the data
 * @property {string[]} blocking
 */

/**
 * The reviewed file against the data as it stands now.
 *
 * @param {{ review: { rows: ReviewRow[], problems: { line: number, reason: string }[] }, transactions: Transaction[], categories: FinanceCategory[] }} input
 * @returns {ApplyPlan}
 */
export function planApply({ review, transactions, categories }) {
  const blocking = review.problems.map((problem) => 'review line ' + problem.line + ': ' + problem.reason);
  const byId = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  /** @type {Set<string>} */
  const claimed = new Set();
  /** @type {PlannedChange[]} */
  const changes = [];
  /** @type {ApplyPlan['transfers']} */
  const transfers = { accepted: 0, rejected: 0, skipped: [] };
  const groups = { decided: 0, skipped: 0 };
  let leftAlone = 0;
  let gone = 0;

  // Transfers first: an accepted pair is no longer open, and a rejected
  // pair's movements fall to their key's group like any other.
  for (const row of review.rows) {
    if (row.row !== 'transfer') continue;
    const decision = row.decision.trim().toLowerCase();
    if (decision === '') {
      transfers.rejected += 1;
      continue;
    }
    if (decision !== TRANSFER) {
      blocking.push('review line ' + row.line + ': a transfer row takes "' + TRANSFER + '" or nothing, received "' + row.decision.trim() + '"');
      continue;
    }
    if (row.ids.length !== 2) {
      blocking.push('review line ' + row.line + ': a transfer row lists two movements in ids, it lists ' + row.ids.length);
      continue;
    }
    const legs = row.ids.map((id) => byId.get(id));
    if (legs.some((leg) => leg === undefined)) {
      transfers.skipped.push({ line: row.line, reason: 'a movement is no longer there; the other is left alone' });
      continue;
    }
    const [first, second] = /** @type {Transaction[]} */ (legs);
    if (first.accountId === second.accountId || first.amount !== -second.amount) {
      blocking.push('review line ' + row.line + ': the two movements in ids are not opposite amounts on two accounts');
      continue;
    }
    if (claimed.has(first.id) || claimed.has(second.id)) {
      blocking.push('review line ' + row.line + ': a movement in ids is already in an earlier transfer row');
      continue;
    }
    if (!isOpen(first) || !isOpen(second)) {
      transfers.skipped.push({ line: row.line, reason: 'a movement was categorised, made a transfer or not counted since; both are left alone' });
      continue;
    }
    transfers.accepted += 1;
    for (const leg of [first, second]) {
      claimed.add(leg.id);
      // Both rows, not counted, no counter account: each balance moves
      // once, by its own row (ADR 0042, both ends statement rows).
      changes.push({ transaction: leg, patch: { notCounted: true }, line: row.line, isNew: false });
    }
  }

  /** @type {Map<string, number>} */
  const seen = new Map();
  const open = transactions.filter(isOpen);
  for (const row of review.rows) {
    if (row.row !== 'group') continue;
    const id = row.key + '\n' + row.direction;
    const earlier = seen.get(id);
    if (earlier !== undefined) {
      blocking.push('review line ' + row.line + ': the key "' + row.key + '" (' + row.direction + ') is already on line ' + earlier);
      continue;
    }
    seen.set(id, row.line);
    const resolved = resolveDecision(row.decision, categories);
    if (resolved.kind === 'error') {
      blocking.push('review line ' + row.line + ' ("' + row.key + '", ' + row.direction + '): ' + resolved.reason);
      continue;
    }
    if (resolved.kind === 'skip') {
      groups.skipped += 1;
      continue;
    }
    groups.decided += 1;
    const listed = new Set(row.ids);
    /** @type {Transaction[]} */
    const members = [];
    for (const listedId of row.ids) {
      const transaction = byId.get(listedId);
      if (transaction === undefined) gone += 1;
      else if (!isOpen(transaction)) {
        if (!claimed.has(transaction.id)) leftAlone += 1;
      } else members.push(transaction);
    }
    for (const transaction of open) {
      if (!listed.has(transaction.id) && merchantKey(transaction) === row.key && directionOf(transaction.amount) === row.direction) members.push(transaction);
    }
    const { categoryId, notCounted } = resolved.proposal;
    for (const transaction of members) {
      if (claimed.has(transaction.id)) continue;
      claimed.add(transaction.id);
      /** @type {PlannedChange['patch']} */
      const patch = {};
      if (categoryId !== null) patch.categoryId = categoryId;
      if (notCounted) patch.notCounted = true;
      changes.push({ transaction, patch, line: row.line, isNew: !listed.has(transaction.id) });
    }
  }

  return {
    changes,
    transfers,
    groups,
    newSince: changes.filter((change) => change.isNew).length,
    leftAlone,
    gone,
    blocking,
  };
}

/**
 * @typedef {object} Totals
 * @property {number} spending
 * @property {number} income
 * @property {number} uncategorisedSpending
 * @property {number} uncategorisedIncome
 */

/**
 * Spending and income over the days the movements cover, on every account,
 * before and after the patches -- from `totalsBetween`, the screens' own
 * derivation, never adjusted. Null when there is nothing to cover.
 *
 * @param {Transaction[]} transactions every one
 * @param {FinanceCategory[]} categories
 * @param {Transaction[]} covered the movements whose days make the range
 * @param {Map<string, Partial<Transaction>>} patches by transaction id
 * @returns {{ from: string, to: string, before: Totals, after: Totals } | null}
 */
export function totalsBeforeAfter(transactions, categories, covered, patches) {
  if (covered.length === 0) return null;
  const days = covered.map((transaction) => transaction.date).sort();
  const from = days[0];
  const to = /** @type {string} */ (days.at(-1));
  /** @param {Transaction[]} rows @returns {Totals} */
  const totals = (rows) => {
    const result = totalsBetween(rows, categories, from, to);
    return {
      spending: result.spending,
      income: result.income,
      uncategorisedSpending: result.uncategorised.spending,
      uncategorisedIncome: result.uncategorised.income,
    };
  };
  const after = transactions.map((transaction) => {
    const patch = patches.get(transaction.id);
    return patch === undefined ? transaction : { ...transaction, ...patch };
  });
  return { from, to, before: totals(transactions), after: totals(after) };
}

/**
 * The patches the proposals would make if every one were kept.
 *
 * @param {ProposalPlan} plan
 * @returns {Map<string, Partial<Transaction>>}
 */
export function proposedPatches(plan) {
  /** @type {Map<string, Partial<Transaction>>} */
  const patches = new Map();
  for (const { out, into } of plan.transfers) {
    patches.set(out.id, { notCounted: true });
    patches.set(into.id, { notCounted: true });
  }
  for (const group of plan.groups) {
    if (group.proposal === null) continue;
    /** @type {Partial<Transaction>} */
    const patch = {};
    if (group.proposal.categoryId !== null) patch.categoryId = group.proposal.categoryId;
    if (group.proposal.notCounted) patch.notCounted = true;
    for (const transaction of group.movements) patches.set(transaction.id, patch);
  }
  return patches;
}
