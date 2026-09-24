'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { formatCount } from '@/components/format.js';

/** @typedef {import('@/lib/domain/types.js').Meal} Meal */

/**
 * Today's meals on the Nutrition card, each one selectable to be corrected
 * in place (#72). The selection is a meal id, never a position: a meal said
 * from the capture bar can land in the middle of the list while one is open.
 * Selecting the open meal again closes it.
 *
 * @param {{ meals: Meal[] }} props in the order they were eaten
 */
export default function MealList({ meals }) {
  const [selectedId, setSelectedId] = useState(/** @type {string | null} */ (null));

  return meals.map((meal) => (
    <div key={meal.id}>
      <button
        type="button"
        className={'meal' + (meal.id === selectedId ? ' is-selected' : '')}
        aria-expanded={meal.id === selectedId}
        onClick={() => setSelectedId(meal.id === selectedId ? null : meal.id)}
      >
        <span className="meal-time num">{meal.time ?? '—'}</span>
        <span className="meal-name">
          {meal.name} {meal.estimated && <span className="badge badge-est">est.</span>}
        </span>
        <span className="meal-kcal num">{meal.calories === null ? '—' : formatCount(meal.calories)}</span>
      </button>
      {meal.id === selectedId && <MealEditor key={meal.id} meal={meal} />}
    </div>
  ));
}

/**
 * One meal's fields, edited in place. Each field saves when you leave it (or
 * on Enter) and Esc puts it back. Optimistic, like the CRM detail panel: the
 * value shows at once; the saved meal the route answers with replaces it --
 * a macro change comes back with its calories recomputed (ADR 0019) -- and
 * a refused save goes back to what was saved, then to the meal as the store
 * holds it once the refresh lands.
 *
 * An empty number or time means unknown, never zero. Delete asks first
 * (#73), like the CRM panel's; the capture that produced the meal stays.
 *
 * @param {{ meal: Meal }} props
 */
function MealEditor({ meal }) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => toDraft(meal));
  const [saved, setSaved] = useState(() => toDraft(meal));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [needsResync, setNeedsResync] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [seenMeal, setSeenMeal] = useState(meal);
  const [, startTransition] = useTransition();

  // After a refused save, the refresh brings the meal as stored; only then
  // are the fields reset to it.
  if (meal !== seenMeal) {
    setSeenMeal(meal);
    if (needsResync) {
      setDraft(toDraft(meal));
      setSaved(toDraft(meal));
      setNeedsResync(false);
    }
  }

  /** @param {keyof ReturnType<typeof toDraft>} field */
  async function save(field) {
    if (draft[field] === saved[field]) return;
    setError(null);
    try {
      const payload = await request(meal.id, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [field]: fromDraft(field, draft[field]) }),
      });
      const stored = toDraft(payload.meal);
      setSaved(stored);
      setDraft((current) => ({ ...current, [field]: stored[field], calories: stored.calories }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong');
      setDraft((current) => ({ ...current, [field]: saved[field] }));
      setNeedsResync(true);
    }
    startTransition(() => router.refresh());
  }

  async function remove() {
    const confirmed = window.confirm(
      'Delete this meal? The capture it came from keeps its sentence. This cannot be undone.'
    );
    if (!confirmed) return;
    setIsDeleting(true);
    setError(null);
    try {
      await request(meal.id, { method: 'DELETE' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong');
      setIsDeleting(false);
    }
    // Win or lose, the list is re-read: a deleted meal leaves it, a refused
    // delete shows the meal as it really is.
    startTransition(() => router.refresh());
  }

  /**
   * @param {keyof ReturnType<typeof toDraft>} field
   * @param {string} label
   * @param {Partial<import('react').InputHTMLAttributes<HTMLInputElement>>} [attributes]
   */
  function input(field, label, attributes = {}) {
    return (
      <label className="field">
        <span className="caption">{label}</span>
        <input
          className="input"
          value={draft[field]}
          onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}
          onBlur={() => save(field)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') setDraft((current) => ({ ...current, [field]: saved[field] }));
          }}
          {...attributes}
        />
      </label>
    );
  }

  const numberAttributes = { inputMode: /** @type {const} */ ('numeric'), placeholder: '—' };
  return (
    <div className="meal-editor">
      {input('name', 'Name')}
      <div className="meal-editor-numbers">
        {input('time', 'Time', { placeholder: 'HH:MM' })}
        {input('calories', 'kcal', numberAttributes)}
        {input('protein', 'Protein g', numberAttributes)}
        {input('carbs', 'Carbs g', numberAttributes)}
        {input('fat', 'Fat g', numberAttributes)}
      </div>
      {error && <p className="receipt-error">{error}</p>}
      <div className="detail-actions">
        <button type="button" className="btn-danger" disabled={isDeleting} onClick={remove}>
          Delete
        </button>
      </div>
    </div>
  );
}

/**
 * One call to the meal route: the saved payload, or an Error carrying the
 * route's own message.
 *
 * @param {string} id
 * @param {RequestInit} init
 */
async function request(id, init) {
  const response = await fetch('/api/meals/' + id, init).catch(() => {
    throw new Error('Could not reach the server');
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message ?? 'Something went wrong');
  return payload;
}

/** @param {Meal} meal */
function toDraft(meal) {
  /** @param {number | null} value */
  const text = (value) => (value === null ? '' : String(value));
  return {
    name: meal.name,
    time: meal.time ?? '',
    calories: text(meal.calories),
    protein: text(meal.protein),
    carbs: text(meal.carbs),
    fat: text(meal.fat),
  };
}

/**
 * What a field's text means to the route: empty is unknown (`null`), a
 * number is a number -- whether it is a whole, non-negative one is the
 * store's call, and its refusal is shown like any other.
 *
 * @param {string} field
 * @param {string} value
 */
function fromDraft(field, value) {
  const trimmed = value.trim();
  if (field === 'name') return trimmed;
  if (trimmed === '') return null;
  return field === 'time' ? trimmed : Number(trimmed);
}
