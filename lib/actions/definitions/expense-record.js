/**
 * `expense.record`: money spent, as a transaction, by the rule a finance
 * capture follows (ADR 0026): on the account named when it is one of yours,
 * else on the default account (`accountForMovement`); never a transfer, in a
 * category of yours or none. With no account to file on, nothing is filed.
 * Undo deletes the transaction, refused once it was touched since.
 *
 * The params kept are the resolved ones -- the account's id, not its name --
 * so the record says where the money went, whatever is renamed later.
 */

import { formatMoney } from '../../domain/format.js';
import {
  accountForMovement,
  createTransaction,
  deleteTransaction,
  getClassifyContext,
  getTransaction,
  isCaptureRecordLocked,
} from '../../store.js';
import { accepted, fieldsOf, isText, rejected } from '../params.js';

/**
 * @typedef {{ amount: number, accountId: string, categoryId: string | null, note: string | null }} ExpenseParams
 */

/** @type {import('../registry.js').ActionDefinition} */
export const expenseRecord = {
  name: 'expense.record',
  risk: 'reversible',
  modelCallable: true,
  schema: {
    type: 'object',
    description:
      'Record money spent today, in cents. On the account named, else on the default account; in one of your categories, or none.',
    properties: {
      amount: { type: 'integer', minimum: 1, description: 'The amount spent, in cents.' },
      account: { type: 'string', description: 'The name of the account it left, when one was named.' },
      categoryId: { type: 'string', description: "One of your categories' ids." },
      note: { type: 'string', description: 'What it was for, in a few words.' },
    },
    required: ['amount'],
    additionalProperties: false,
  },

  async parse(raw) {
    const { fields, error } = fieldsOf(raw, ['amount'], ['account', 'categoryId', 'note']);
    if (fields === null) return rejected(error);
    const { amount, account, categoryId, note } = fields;
    // Money is an integer in minor units (ADR 0009); spending is the
    // direction, so the amount said is positive.
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) {
      return rejected('amount must be a whole number of cents above 0, received ' + JSON.stringify(amount));
    }
    if (account !== undefined && !isText(account)) {
      return rejected('account must be the name of one of your accounts, received ' + JSON.stringify(account));
    }
    if (note !== undefined && typeof note !== 'string') return rejected('note must be text, received ' + JSON.stringify(note));
    if (categoryId !== undefined && categoryId !== null) {
      const { categories = [] } = await getClassifyContext();
      if (!categories.some((category) => category.id === categoryId)) {
        return rejected('categoryId must be one of your open categories, received ' + JSON.stringify(categoryId));
      }
    }
    const accountId = await accountForMovement(/** @type {string | undefined} */ (account));
    if (accountId === null) return rejected('no account to file it on: name one of yours, or choose a default account');

    return accepted({
      amount,
      accountId,
      categoryId: categoryId ?? null,
      note: typeof note === 'string' && note.trim() !== '' ? note.trim() : null,
    });
  },

  async run(params, ctx) {
    const { amount, accountId, categoryId, note } = /** @type {ExpenseParams} */ (params);
    const transaction = await createTransaction({
      date: ctx.day,
      amount: -amount,
      accountId,
      categoryId,
      // What was said about it, as a capture's sentence is (ADR 0026).
      description: note ?? '',
      source: ctx.source,
    });
    return { recordRef: transaction.id, before: null };
  },

  async isLocked(record) {
    const transaction = await getTransaction(/** @type {string} */ (record.recordRef));
    return transaction === null || isCaptureRecordLocked(transaction);
  },

  async undo(record) {
    await deleteTransaction(/** @type {string} */ (record.recordRef));
  },

  async line(params) {
    const { amount, categoryId, note } = /** @type {ExpenseParams} */ (params);
    const spent = 'Spent ' + formatMoney(amount, { cents: true });
    const category =
      categoryId === null ? undefined : (await getClassifyContext()).categories?.find((row) => row.id === categoryId);
    // What it was for, when it was said: a line read off a sentence says
    // which money it is ("Spent 18.00 on Eating out — lunch").
    return spent + (category === undefined ? '' : ' on ' + category.name) + (note === null ? '' : ' — ' + note);
  },
};
