'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import {
  categoryOptions,
  DIRECTION_LABELS,
  directionOf,
  financesHref,
  parseTags,
  signedAmount,
  transactionUrl,
} from '@/components/finance.js';
import { formatMoney, parseMoney } from '@/components/format.js';
import { messageOf, request } from '@/components/request.js';
import { monthOf } from '@/lib/domain/dates.js';

/** @typedef {import('@/lib/domain/types.js').Transaction} Transaction */
/** @typedef {import('@/lib/domain/types.js').FinanceAccount} FinanceAccount */
/** @typedef {import('@/lib/domain/types.js').FinanceCategory} FinanceCategory */
/** @typedef {import('@/components/finance.js').Direction} Direction */
/** @typedef {import('@/components/finance.js').FinancesPlace} FinancesPlace */

/** @type {Direction[]} */
const DIRECTIONS = ['out', 'in', 'transfer'];

/**
 * What the form and the panel are given.
 *
 * @typedef {object} PanelProps
 * @property {FinanceAccount[]} accounts every account
 * @property {FinanceCategory[]} categories every category
 * @property {FinancesPlace} place
 */

/**
 * The accounts money can be recorded on: those valued by balance -- a
 * holding is valued by its trades and ignores transactions, so it is only
 * ever the other end of a transfer. Open ones first; an archived one stays
 * on offer for a movement dated before it closed, and the store refuses a
 * later one with its reason.
 *
 * @param {FinanceAccount[]} accounts
 * @returns {FinanceAccount[]}
 */
function movableAccounts(accounts) {
  const byBalance = accounts.filter((account) => account.valuation === 'balance');
  return [...byBalance.filter((account) => account.archivedOn === null), ...byBalance.filter((account) => account.archivedOn !== null)];
}

/**
 * The other end a transfer can have: any account but the first one, open
 * ones first.
 *
 * @param {FinanceAccount[]} accounts
 * @param {string} accountId
 * @returns {FinanceAccount[]}
 */
function counterAccounts(accounts, accountId) {
  const others = accounts.filter((account) => account.id !== accountId);
  return [...others.filter((account) => account.archivedOn === null), ...others.filter((account) => account.archivedOn !== null)];
}

/**
 * The Finances screen's movement form (#134), shown in the side panel when
 * no transaction is selected -- the counterpart of the spreadsheet's form.
 * Money out, money in or a transfer, so nobody types a sign; for a transfer
 * it asks for the other account and hides the category. The amount is in
 * euros and stored as exact cents. A movement dated in another month opens
 * that month, so what you just recorded is in front of you.
 *
 * @param {PanelProps & { todayKey: string }} props
 */
export function FinanceMovementForm({ accounts, categories, todayKey, place }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const movable = movableAccounts(accounts);
  const [direction, setDirection] = useState(/** @type {Direction} */ ('out'));
  const [date, setDate] = useState(todayKey);
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(movable[0]?.id ?? '');
  const [counterAccountId, setCounterAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');
  const [notCounted, setNotCounted] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [isSaving, setIsSaving] = useState(false);

  /** @param {import('react').FormEvent} event */
  async function record(event) {
    event.preventDefault();
    const minor = parseMoney(amount);
    if (minor === null || minor === 0) {
      setError('Enter an amount like 18.40');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await request('/api/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          date,
          amount: signedAmount(direction, minor),
          accountId,
          ...(direction === 'transfer' ? { counterAccountId } : { categoryId: categoryId === '' ? null : categoryId }),
          description: description.trim(),
          note: note.trim(),
          tags: parseTags(tags),
          notCounted,
        }),
      });
      setAmount('');
      setDescription('');
      setNote('');
      setTags('');
      setNotCounted(false);
      if (monthOf(date) !== place.month) {
        router.push(financesHref({ ...place, month: monthOf(date) }), { scroll: false });
      }
    } catch (caught) {
      setError(messageOf(caught));
    }
    setIsSaving(false);
    startTransition(() => router.refresh());
  }

  return (
    <aside id="card-finance-movement" className="card">
      <div className="card-head">
        <span className="eyebrow">Record a movement</span>
      </div>
      <div className="card-body">
        {error !== null && (
          <p className="caption is-error" role="alert">
            {error}
          </p>
        )}
        {movable.length === 0 ? (
          <p className="caption">Add an account valued by balance to record money moving on it.</p>
        ) : (
          <form onSubmit={record}>
            <DirectionPicker direction={direction} onChange={setDirection} />
            <div className="finance-entry">
              <div className="field">
                <label className="caption" htmlFor="m-amount">Amount</label>
                <input
                  id="m-amount"
                  className="input num"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
              <div className="field">
                <label className="caption" htmlFor="m-date">On</label>
                <input
                  id="m-date"
                  type="date"
                  className="input"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
            </div>
            <div className="finance-entry">
              <AccountPicker
                id="m-account"
                label={direction === 'transfer' ? 'From' : 'Account'}
                accounts={movable}
                value={accountId}
                onChange={(id) => {
                  setAccountId(id);
                  // A transfer from an account to itself moves nothing.
                  if (id === counterAccountId) setCounterAccountId('');
                }}
              />
              {direction === 'transfer' ? (
                <AccountPicker
                  id="m-counter"
                  label="To"
                  accounts={counterAccounts(accounts, accountId)}
                  value={counterAccountId}
                  onChange={setCounterAccountId}
                  placeholder="Choose an account"
                />
              ) : (
                <CategoryPicker id="m-category" categories={categories} value={categoryId} onChange={setCategoryId} />
              )}
            </div>
            <div className="field">
              <label className="caption" htmlFor="m-description">Description</label>
              <input id="m-description" className="input" value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            <div className="finance-entry">
              <div className="field">
                <label className="caption" htmlFor="m-note">Note</label>
                <input id="m-note" className="input" value={note} onChange={(event) => setNote(event.target.value)} />
              </div>
              <div className="field">
                <label className="caption" htmlFor="m-tags">Tags</label>
                <input
                  id="m-tags"
                  className="input"
                  placeholder="home, gift"
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                />
              </div>
            </div>
            <label className="finance-check caption">
              <input type="checkbox" checked={notCounted} onChange={(event) => setNotCounted(event.target.checked)} />
              Not counted: it moves the balance, not the month&apos;s income or spending
            </label>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSaving || amount.trim() === '' || (direction === 'transfer' && counterAccountId === '')}
            >
              Record
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}

/**
 * The fields of a transaction as the panel shows them while you edit.
 *
 * @param {Transaction} transaction
 */
function editable(transaction) {
  return {
    signed: transaction.amount,
    direction: directionOf(transaction),
    date: transaction.date,
    amount: formatMoney(Math.abs(transaction.amount), { cents: true }),
    accountId: transaction.accountId,
    counterAccountId: transaction.counterAccountId ?? '',
    categoryId: transaction.categoryId ?? '',
    description: transaction.description,
    note: transaction.note,
    tags: transaction.tags.join(', '),
    notCounted: transaction.notCounted,
  };
}

/**
 * The selected transaction's panel (#134), opened by `?transaction=<id>`:
 * every field corrected in place, the way the Goals panel corrects a goal.
 * Each control writes one field and the panel shows it at once; a refused
 * write shows why and puts every field back to what the store really holds,
 * once the refresh has brought it.
 *
 * Text and the amount save when you leave the field (also on Enter); Esc in
 * a field puts it back, Esc anywhere else closes the panel. Money out and
 * money in flip the sign. Transfer asks for the other account and saves when
 * one is chosen -- that turns the movement into a transfer and clears its
 * category. A transfer keeps its sign: money that left this account went to
 * the other one, money that arrived came from it. Delete asks first; a
 * capture that produced the movement keeps its sentence.
 *
 * Mounted with `key={transaction.id}`, so selecting another starts clean.
 *
 * @param {PanelProps & { transaction: Transaction }} props
 */
export default function FinanceTransactionDetail({ transaction, accounts, categories, place }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState(() => editable(transaction));
  const [saved, setSaved] = useState(() => editable(transaction));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [needsResync, setNeedsResync] = useState(false);
  const [seen, setSeen] = useState(transaction);
  const [isActing, setIsActing] = useState(false);
  const discardingEdit = useRef(false);
  const closed = financesHref({ ...place, transaction: null });

  // After a failed write the refresh brings back the transaction as stored;
  // only then are the fields reset to it.
  if (transaction !== seen) {
    setSeen(transaction);
    if (needsResync) {
      setDraft(editable(transaction));
      setSaved(editable(transaction));
      setNeedsResync(false);
    }
  }

  useEffect(() => {
    /** @param {KeyboardEvent} event */
    function onKeyDown(event) {
      if (event.key !== 'Escape') return;
      const target = /** @type {HTMLElement | null} */ (event.target);
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
      router.push(closed, { scroll: false });
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [router, closed]);

  /**
   * @param {Record<string, unknown>} body what the route receives
   * @param {Partial<ReturnType<typeof editable>>} shown what the fields show meanwhile
   * @returns {Promise<boolean>} whether it was saved
   */
  async function save(body, shown) {
    setDraft((current) => ({ ...current, ...shown }));
    setError(null);
    let ok = true;
    try {
      await request(transactionUrl(transaction.id), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      setSaved((current) => ({ ...current, ...shown }));
    } catch (caught) {
      setError(messageOf(caught));
      setDraft(saved);
      setNeedsResync(true);
      ok = false;
    }
    startTransition(() => router.refresh());
    return ok;
  }

  /** @param {'description' | 'note'} field */
  function commitText(field) {
    if (discardingEdit.current) {
      discardingEdit.current = false;
      return;
    }
    const value = draft[field].trim();
    if (value === saved[field]) return;
    save({ [field]: value }, { [field]: value });
  }

  function commitTags() {
    if (discardingEdit.current) {
      discardingEdit.current = false;
      return;
    }
    const tags = parseTags(draft.tags);
    if (tags.join(', ') === saved.tags) return;
    save({ tags }, { tags: tags.join(', ') });
  }

  function commitAmount() {
    if (discardingEdit.current) {
      discardingEdit.current = false;
      return;
    }
    const minor = parseMoney(draft.amount);
    if (minor === null || minor === 0) {
      setError('Enter an amount like 18.40');
      setDraft((current) => ({ ...current, amount: saved.amount }));
      return;
    }
    const shown = formatMoney(Math.abs(minor), { cents: true });
    if (shown === saved.amount) {
      setDraft((current) => ({ ...current, amount: shown }));
      return;
    }
    // A transfer keeps the sign it has; a movement takes its direction's.
    const sign = draft.direction === 'transfer' ? Math.sign(saved.signed) : signedAmount(draft.direction, 1);
    const signed = sign * Math.abs(minor);
    save({ amount: signed }, { amount: shown, signed });
  }

  async function commitDate() {
    if (draft.date === saved.date) return;
    const date = draft.date;
    // Moved to another month, it is followed there, still selected.
    if ((await save({ date }, { date })) && monthOf(date) !== place.month) {
      router.push(financesHref({ ...place, month: monthOf(date) }), { scroll: false });
    }
  }

  /** @param {Direction} direction */
  function chooseDirection(direction) {
    if (direction === draft.direction) return;
    if (direction === 'transfer') {
      // Nothing is saved until the other account is chosen.
      setDraft((current) => ({ ...current, direction, counterAccountId: '' }));
      return;
    }
    const signed = signedAmount(direction, Math.abs(saved.signed));
    save(
      { amount: signed, ...(saved.direction === 'transfer' ? { counterAccountId: null } : {}) },
      { direction, counterAccountId: '', signed }
    );
  }

  async function remove() {
    if (!window.confirm('Delete this transaction? This cannot be undone.')) return;
    setIsActing(true);
    setError(null);
    try {
      await request(transactionUrl(transaction.id), { method: 'DELETE' });
      router.push(closed, { scroll: false });
    } catch (caught) {
      setError(messageOf(caught));
    }
    setIsActing(false);
    startTransition(() => router.refresh());
  }

  /**
   * Text-field keys: Enter saves by leaving, Esc puts the saved value back.
   *
   * @param {'description' | 'note' | 'tags' | 'amount'} field
   * @returns {(event: import('react').KeyboardEvent<HTMLInputElement>) => void}
   */
  const keysFor = (field) => (event) => {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') {
      discardingEdit.current = true;
      setDraft((current) => ({ ...current, [field]: saved[field] }));
      event.currentTarget.blur();
    }
  };

  const fromHere = saved.signed < 0;

  return (
    <aside id="card-finance-transaction" className="card">
      <div className="card-head">
        <span className="eyebrow">Transaction</span>
        <button type="button" className="btn-ghost" aria-label="Esc: close the panel" onClick={() => router.push(closed, { scroll: false })}>
          Esc
        </button>
      </div>
      <div className="card-body">
        {error !== null && (
          <p className="caption is-error" role="alert">
            {error}
          </p>
        )}
        <DirectionPicker direction={draft.direction} onChange={chooseDirection} />
        <div className="finance-entry">
          <div className="field">
            <label className="caption" htmlFor="t-amount">Amount</label>
            <input
              id="t-amount"
              className="input num"
              inputMode="decimal"
              value={draft.amount}
              onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
              onBlur={commitAmount}
              onKeyDown={keysFor('amount')}
            />
          </div>
          <div className="field">
            <label className="caption" htmlFor="t-date">On</label>
            <input
              id="t-date"
              type="date"
              className="input"
              value={draft.date}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
              onBlur={commitDate}
            />
          </div>
        </div>
        <div className="finance-entry">
          <AccountPicker
            id="t-account"
            label={draft.direction !== 'transfer' ? 'Account' : fromHere ? 'From' : 'To'}
            accounts={movableAccounts(accounts).filter((account) => account.id !== draft.counterAccountId)}
            value={draft.accountId}
            onChange={(accountId) => save({ accountId }, { accountId })}
          />
          {draft.direction === 'transfer' ? (
            <AccountPicker
              id="t-counter"
              label={fromHere ? 'To' : 'From'}
              accounts={counterAccounts(accounts, draft.accountId)}
              value={draft.counterAccountId}
              placeholder="Choose an account"
              onChange={(counterAccountId) => save({ counterAccountId }, { counterAccountId, categoryId: '', direction: 'transfer' })}
            />
          ) : (
            <CategoryPicker
              id="t-category"
              categories={categories}
              value={draft.categoryId}
              onChange={(categoryId) => save({ categoryId: categoryId === '' ? null : categoryId }, { categoryId })}
            />
          )}
        </div>
        <div className="field">
          <label className="caption" htmlFor="t-description">Description</label>
          <input
            id="t-description"
            className="input"
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            onBlur={() => commitText('description')}
            onKeyDown={keysFor('description')}
          />
        </div>
        <div className="finance-entry">
          <div className="field">
            <label className="caption" htmlFor="t-note">Note</label>
            <input
              id="t-note"
              className="input"
              value={draft.note}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              onBlur={() => commitText('note')}
              onKeyDown={keysFor('note')}
            />
          </div>
          <div className="field">
            <label className="caption" htmlFor="t-tags">Tags</label>
            <input
              id="t-tags"
              className="input"
              value={draft.tags}
              onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
              onBlur={commitTags}
              onKeyDown={keysFor('tags')}
            />
          </div>
        </div>
        <label className="finance-check caption">
          <input
            type="checkbox"
            checked={draft.notCounted}
            onChange={(event) => save({ notCounted: event.target.checked }, { notCounted: event.target.checked })}
          />
          Not counted: it moves the balance, not the month&apos;s income or spending
        </label>
        <div className="detail-actions">
          <button type="button" className="btn-danger" disabled={isActing} onClick={remove}>
            Delete
          </button>
        </div>
      </div>
    </aside>
  );
}

/**
 * @param {{ direction: Direction, onChange: (direction: Direction) => void }} props
 */
function DirectionPicker({ direction, onChange }) {
  return (
    <div className="segmented finance-direction" role="group" aria-label="Direction">
      {DIRECTIONS.map((choice) => (
        <button
          key={choice}
          type="button"
          className={'seg' + (direction === choice ? ' is-on' : '')}
          aria-pressed={direction === choice}
          onClick={() => onChange(choice)}
        >
          {DIRECTION_LABELS[choice]}
        </button>
      ))}
    </div>
  );
}

/**
 * @param {{
 *   id: string,
 *   label: string,
 *   accounts: FinanceAccount[],
 *   value: string,
 *   onChange: (id: string) => void,
 *   placeholder?: string,
 * }} props
 */
function AccountPicker({ id, label, accounts, value, onChange, placeholder }) {
  return (
    <div className="field">
      <label className="caption" htmlFor={id}>{label}</label>
      <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.archivedOn === null ? account.name : account.name + ' (archived)'}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * The categories you can file on, a parent or one of its subcategories
 * (categoryOptions).
 *
 * @param {{ id: string, categories: FinanceCategory[], value: string, onChange: (id: string) => void }} props
 */
function CategoryPicker({ id, categories, value, onChange }) {
  return (
    <div className="field">
      <label className="caption" htmlFor={id}>Category</label>
      <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Uncategorised</option>
        {categoryOptions(categories, value).map(({ kind, label, options }) => (
          <optgroup key={kind} label={label}>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.child ? '\u00a0\u00a0\u00a0' + option.name : option.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
