/**
 * Made-up statement movements for categorising (ADR 0043), built by the
 * tests themselves: every account, merchant, description and amount here is
 * invented, and no row belongs to anyone. The repository is public.
 *
 * Two shapes: plain records for the pure plan (`fakeAccount`, `fakeMovement`),
 * and movements written through the store as `data:import-statement` writes
 * them (`StatementBook`).
 *
 * Not collected on its own -- vitest only picks up *.test.js.
 */

/**
 * @typedef {import('@/lib/domain/types.js').Transaction} Transaction
 * @typedef {import('@/lib/domain/types.js').FinanceAccount} FinanceAccount
 *
 * @typedef {object} Move
 * @property {string} account the account's id (fake) or name (store)
 * @property {string} date
 * @property {number} amount signed minor units
 * @property {string} [description]
 * @property {Record<string, string>} [detail] what the statement kept on the origin
 * @property {string | null} [categoryId]
 * @property {boolean} [notCounted]
 */

/**
 * @param {string} id
 * @param {FinanceAccount['kind']} [kind]
 * @returns {FinanceAccount}
 */
export function fakeAccount(id, kind = 'cash') {
  return /** @type {FinanceAccount} */ ({ id, name: 'Account ' + id, kind, currency: 'EUR', origin: null, archivedOn: null, valuation: 'balance' });
}

let sequence = 0;

/**
 * @param {Move} move
 * @returns {Transaction}
 */
export function fakeMovement({ account, date, amount, description = 'Movement', detail = {}, categoryId = null, notCounted = false }) {
  sequence += 1;
  const id = 'txn_' + String(sequence).padStart(4, '0');
  return /** @type {Transaction} */ ({
    id,
    date,
    amount,
    currency: 'EUR',
    description,
    accountId: account,
    counterAccountId: null,
    categoryId,
    notCounted,
    tags: [],
    note: '',
    origin: { source: 'statement', externalId: account + ':' + id, syncedAt: '2026-03-01T00:00:00.000Z', sourceUpdatedAt: null, detail },
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    source: 'integration',
  });
}

/**
 * Accounts and statement movements written through a store, as
 * `data:import-statement` would have written them.
 */
export class StatementBook {
  /** @param {typeof import('@/lib/store.js')} store */
  constructor(store) {
    this.store = store;
    /** @type {Map<string, FinanceAccount>} */
    this.accounts = new Map();
    this.count = 0;
  }

  /**
   * @param {string} name
   * @returns {Promise<FinanceAccount>}
   */
  async account(name) {
    const existing = this.accounts.get(name);
    if (existing !== undefined) return existing;
    const account = await this.store.createAccount({ name, kind: 'cash', valuation: 'balance', source: 'integration' });
    this.accounts.set(name, account);
    return account;
  }

  /**
   * @param {Move} move `account` is a name
   * @returns {Promise<Transaction>}
   */
  async move({ account, date, amount, description = 'Movement', detail = {}, categoryId = null, notCounted = false }) {
    const owner = await this.account(account);
    this.count += 1;
    const row = await this.store.upsertTransactionByOrigin({
      date,
      amount,
      description,
      accountId: owner.id,
      origin: { source: 'statement', externalId: owner.id + ':row' + this.count, detail },
      source: 'integration',
    });
    if (categoryId !== null || notCounted) {
      return this.store.updateTransaction(row.id, { ...(categoryId === null ? {} : { categoryId }), ...(notCounted ? { notCounted } : {}) });
    }
    return row;
  }
}
