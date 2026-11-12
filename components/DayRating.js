'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { messageOf, request } from '@/components/request.js';

/**
 * The five taps. Pure: which one is marked, and what a tap sends back. The
 * chosen one is marked in a neutral colour -- a rating is a reading of the
 * day, not a verdict, so no green and no red.
 *
 * @param {{
 *   scale: number[],
 *   value: number | null,
 *   disabled: boolean,
 *   onPick: (rating: number) => void,
 * }} props
 */
export function RatingButtons({ scale, value, disabled, onPick }) {
  return (
    <div className="rating-scale" role="group" aria-label="Rate the day">
      {scale.map((rating) => (
        <button
          key={rating}
          type="button"
          className={'rating-btn num' + (rating === value ? ' is-chosen' : '')}
          aria-pressed={rating === value}
          disabled={disabled}
          onClick={() => onPick(rating)}
        >
          {rating}
        </button>
      ))}
    </div>
  );
}

/**
 * The Close the day card's rating (#243). A tap marks the day at once and
 * PUTs it; tapping the chosen one again changes nothing but "Clear" removes
 * it. A failed save says so and re-reads the saved rating from the server
 * (CODING_STANDARDS, Screens), and every settle re-reads real state with `router.refresh()`
 * (docs/architecture.md, Data flow). One save at a time, so two taps can
 * never land out of order.
 *
 * @param {{ date: string, scale: number[], initial: number | null }} props
 */
export default function DayRating({ date, scale, initial }) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const router = useRouter();

  /** @param {number | null} rating */
  async function save(rating) {
    if (saving) return;
    setSaving(true);
    setError(null);
    setValue(rating);
    try {
      await request('/api/days/' + date, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating }),
      });
    } catch (caught) {
      setError(messageOf(caught));
      // Show what is really saved, not what this component remembers.
      try {
        const stored = await request('/api/days/' + date, { method: 'GET' });
        setValue(stored.rating);
      } catch {
        // The server cannot be reached: keep the error; the refresh below retries.
      }
    }
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="day-rating">
      <RatingButtons scale={scale} value={value} disabled={saving} onPick={save} />
      <div className="day-rating-foot">
        <span className="caption">{value === null ? 'How did today go?' : 'Tap another to change it.'}</span>
        {value !== null && (
          <button type="button" className="btn-ghost" disabled={saving} onClick={() => save(null)}>
            Clear
          </button>
        )}
      </div>
      {error && (
        <p className="caption" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
