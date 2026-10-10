'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { CATEGORY_GROUPS, categoryUrl } from '@/components/finance.js';
import { messageOf, request } from '@/components/request.js';
import { CATEGORY_KINDS } from '@/personalos.config.js';

/** @typedef {import('@/lib/domain/types.js').FinanceCategory} FinanceCategory */

/**
 * The Finances screen's Categories card (#136): your categories in two
 * levels, spending first, each parent followed by its subcategories. A name
 * saves when you leave it; Fixed flags a fixed cost on that category alone;
 * a subcategory moves under another parent of the same kind; Archive takes a
 * category out of the pickers, keeping its transactions and totals, and
 * Restore brings it back; Delete asks first and is refused while the
 * category or a subcategory is in use. Every write posts and then re-reads
 * the screen, win or lose.
 *
 * @param {{ categories: FinanceCategory[] }} props
 */
export default function FinanceCategories({ categories }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState('');
  const [under, setUnder] = useState('expense');

  /**
   * @param {string} url
   * @param {RequestInit} init
   * @returns {Promise<boolean>} whether it was saved
   */
  async function write(url, init) {
    setIsSaving(true);
    setError(null);
    let saved = true;
    try {
      await request(url, init);
    } catch (caught) {
      setError(messageOf(caught));
      saved = false;
    }
    setIsSaving(false);
    startTransition(() => router.refresh());
    return saved;
  }

  /** @param {string} id @param {Record<string, unknown>} body */
  const patch = (id, body) =>
    write(categoryUrl(id), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  /** @param {import('react').FormEvent} event */
  async function add(event) {
    event.preventDefault();
    const topLevel = CATEGORY_KINDS.includes(under);
    const saved = await write('/api/finance-categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(topLevel ? { name, kind: under } : { name, parentId: under }),
    });
    if (saved) setName('');
  }

  /** @param {FinanceCategory} category */
  async function remove(category) {
    if (!window.confirm('Delete ' + category.name + '? Its subcategories go with it. This cannot be undone.')) return;
    await write(categoryUrl(category.id), { method: 'DELETE' });
  }

  const parents = categories.filter((category) => category.parentId === null);

  return (
    <article id="card-finance-categories" className="card">
      <div className="card-head">
        <span className="eyebrow">Categories</span>
      </div>
      <div className="card-body">
        {error !== null && (
          <p className="caption is-error" role="alert">
            {error}
          </p>
        )}
        {CATEGORY_GROUPS.map(({ kind, label }) => (
          <div key={kind} className="finance-category-group">
            <p className="caption">{label}</p>
            <ul className="finance-categories">
              {parents
                .filter((parent) => parent.kind === kind)
                .flatMap((parent) => [parent, ...categories.filter((category) => category.parentId === parent.id)])
                .map((category) => (
                  <CategoryRow
                    key={category.id + ':' + category.name}
                    category={category}
                    parents={parents.filter((parent) => parent.kind === kind && (!parent.archived || parent.id === category.parentId))}
                    isSaving={isSaving}
                    onPatch={(body) => patch(category.id, body)}
                    onDelete={() => remove(category)}
                  />
                ))}
            </ul>
          </div>
        ))}
        <form className="finance-entry" onSubmit={add}>
          <div className="field">
            <label className="caption" htmlFor="c-name">New category</label>
            <input id="c-name" className="input" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="field">
            <label className="caption" htmlFor="c-under">Under</label>
            <select id="c-under" className="input" value={under} onChange={(event) => setUnder(event.target.value)}>
              {CATEGORY_GROUPS.map(({ kind, label }) => (
                <option key={kind} value={kind}>
                  Top level ({label.toLowerCase()})
                </option>
              ))}
              {parents
                .filter((parent) => !parent.archived)
                .map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.name}
                  </option>
                ))}
            </select>
          </div>
          <button type="submit" className="btn-primary" disabled={isSaving || name.trim() === ''}>
            Add
          </button>
        </form>
      </div>
    </article>
  );
}

/**
 * One category's row. Mounted with its saved name in the key, so a refused
 * rename comes back as the name the store holds.
 *
 * @param {{
 *   category: FinanceCategory,
 *   parents: FinanceCategory[],
 *   isSaving: boolean,
 *   onPatch: (body: Record<string, unknown>) => Promise<boolean>,
 *   onDelete: () => void,
 * }} props
 */
function CategoryRow({ category, parents, isSaving, onPatch, onDelete }) {
  const [name, setName] = useState(category.name);
  const child = category.parentId !== null;

  async function commitName() {
    const trimmed = name.trim();
    if (trimmed === '' || trimmed === category.name) {
      setName(category.name);
      return;
    }
    if (!(await onPatch({ name: trimmed }))) setName(category.name);
  }

  return (
    <li className={'finance-category' + (child ? ' is-child' : '') + (category.archived ? ' is-archived' : '')}>
      <input
        aria-label={'Name of ' + category.name}
        className="input"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={commitName}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setName(category.name);
            event.currentTarget.blur();
          }
        }}
      />
      {child && (
        <select
          aria-label={'Move ' + category.name + ' under'}
          className="input"
          value={category.parentId ?? ''}
          disabled={isSaving}
          onChange={(event) => onPatch({ parentId: event.target.value })}
        >
          {parents.map((parent) => (
            <option key={parent.id} value={parent.id}>
              {parent.name}
            </option>
          ))}
        </select>
      )}
      <label className="caption finance-check">
        <input
          type="checkbox"
          checked={category.fixedCost}
          disabled={isSaving}
          onChange={(event) => onPatch({ fixedCost: event.target.checked })}
        />
        Fixed
      </label>
      <button type="button" className="btn-ghost" disabled={isSaving} onClick={() => onPatch({ archived: !category.archived })}>
        {category.archived ? 'Restore' : 'Archive'}
      </button>
      <button type="button" className="btn-ghost" disabled={isSaving} onClick={onDelete}>
        Delete
      </button>
    </li>
  );
}
