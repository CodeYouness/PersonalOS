'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { messageOf, request } from '@/components/request.js';

/**
 * The five taps of one reading, mood or energy. Pure: which one is marked,
 * and what a tap sends back. The chosen one is marked in a neutral colour --
 * a mood or an energy is a reading of the day, not a verdict, so no green and
 * no red. `label` names the group, so the two on the card are told apart.
 *
 * @param {{
 *   scale: readonly number[],
 *   value: number | null,
 *   label: string,
 *   disabled: boolean,
 *   onPick: (value: number) => void,
 * }} props
 */
export function RatingButtons({ scale, value, label, disabled, onPick }) {
  return (
    <div className="rating-scale" role="group" aria-label={label}>
      {scale.map((step) => (
        <button
          key={step}
          type="button"
          className={'rating-btn num' + (step === value ? ' is-chosen' : '')}
          aria-pressed={step === value}
          disabled={disabled}
          onClick={() => onPick(step)}
        >
          {step}
        </button>
      ))}
    </div>
  );
}

/**
 * One of the Close the day card's two readings, mood or energy (#243, ADR
 * 0037); the card draws it once for each, and each writes only its own
 * field. A tap marks the day at once and PUTs `{ [field]: value }`; tapping
 * the chosen one again changes nothing but "Clear" removes it. A failed save
 * says so and re-reads the saved value of this field from the server
 * (CODING_STANDARDS, Screens), and every settle re-reads real state with `router.refresh()`
 * (docs/architecture.md, Data flow). One save at a time, so two taps can
 * never land out of order.
 *
 * @param {{
 *   date: string,
 *   field: import('@/lib/domain/day-readings.js').DayReading,
 *   label: string,
 *   prompt: string,
 *   scale: readonly number[],
 *   initial: number | null,
 * }} props
 */
export default function DayRating({ date, field, label, prompt, scale, initial }) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const router = useRouter();

  /** @param {number | null} next */
  async function save(next) {
    if (saving) return;
    setSaving(true);
    setError(null);
    setValue(next);
    try {
      await request('/api/days/' + date, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [field]: next }),
      });
    } catch (caught) {
      setError(messageOf(caught));
      // Show what is really saved, not what this component remembers.
      try {
        const stored = await request('/api/days/' + date, { method: 'GET' });
        setValue(stored[field]);
      } catch {
        // The server cannot be reached: keep the error; the refresh below retries.
      }
    }
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="day-rating">
      <RatingButtons scale={scale} value={value} label={label} disabled={saving} onPick={save} />
      <div className="day-rating-foot">
        <span className="caption">{value === null ? prompt : 'Tap another to change it.'}</span>
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
