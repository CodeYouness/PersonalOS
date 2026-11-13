'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { formatMinutes } from '@/components/format.js';
import { messageOf, request } from '@/components/request.js';

/**
 * @typedef {{ key: string, label: string }} TimeAreaOption
 */

/**
 * One − / + stepper per area, in half hours. Pure: what each area shows and
 * what a tap sends back. `time` null is a day not declared: every area reads
 * 0 and "−" is off; "+" stops at the most one area can take.
 *
 * @param {{
 *   areas: readonly TimeAreaOption[],
 *   time: Record<string, number> | null,
 *   step: number,
 *   max: number,
 *   disabled: boolean,
 *   onSet: (area: string, minutes: number) => void,
 * }} props
 */
export function TimeSteppers({ areas, time, step, max, disabled, onSet }) {
  return (
    <ul className="time-areas">
      {areas.map(({ key, label }) => {
        const minutes = time?.[key] ?? 0;
        return (
          <li key={key} className={'time-area' + (minutes > 0 ? ' has-time' : '')}>
            <span className="time-label">{label}</span>
            <button
              type="button"
              className="time-step-btn"
              aria-label={'Less ' + label}
              disabled={disabled || minutes === 0}
              onClick={() => onSet(key, minutes - step)}
            >
              &minus;
            </button>
            <span className="time-value num">{formatMinutes(minutes)}</span>
            <button
              type="button"
              className="time-step-btn"
              aria-label={'More ' + label}
              disabled={disabled || minutes + step > max}
              onClick={() => onSet(key, minutes + step)}
            >
              +
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The Close the day card's time row (ADR 0037): how the day's time went,
 * declared against each area in half hours. A tap moves that area at once and
 * PUTs its new absolute minutes, so a retried save never doubles them;
 * "Nothing to declare", shown while the day is not declared, PUTs `{}`, and
 * "Clear time" takes the day back to not declared. A failed save says so and
 * re-reads the day's saved time from the server (CODING_STANDARDS, Screens);
 * every settle re-reads real state with `router.refresh()`. One save at a
 * time, so two taps can never land out of order.
 *
 * @param {{
 *   date: string,
 *   areas: readonly TimeAreaOption[],
 *   step: number,
 *   max: number,
 *   initial: Record<string, number> | null,
 * }} props
 */
export default function DayTime({ date, areas, step, max, initial }) {
  const [time, setTime] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const router = useRouter();

  /**
   * @param {Record<string, number> | null} optimistic what the row shows at once
   * @param {Record<string, number> | null} body the `time` sent
   */
  async function save(optimistic, body) {
    if (saving) return;
    setSaving(true);
    setError(null);
    setTime(optimistic);
    try {
      const stored = await request('/api/days/' + date, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ time: body }),
      });
      setTime(stored.time);
    } catch (caught) {
      setError(messageOf(caught));
      // Show what is really saved, not what this component remembers.
      try {
        const stored = await request('/api/days/' + date, { method: 'GET' });
        setTime(stored.time);
      } catch {
        // The server cannot be reached: keep the error; the refresh below retries.
      }
    }
    setSaving(false);
    router.refresh();
  }

  /**
   * @param {string} area
   * @param {number} minutes
   */
  function setArea(area, minutes) {
    const next = { ...(time ?? {}) };
    if (minutes === 0) delete next[area];
    else next[area] = minutes;
    save(next, { [area]: minutes });
  }

  return (
    <div className="day-time">
      <TimeSteppers areas={areas} time={time} step={step} max={max} disabled={saving} onSet={setArea} />
      <div className="day-rating-foot">
        <span className="caption">{time === null ? 'In half hours, as best you remember.' : 'Tap − or + to change it.'}</span>
        {time === null ? (
          <button type="button" className="btn-ghost" disabled={saving} onClick={() => save({}, {})}>
            Nothing to declare
          </button>
        ) : (
          <button type="button" className="btn-ghost" disabled={saving} onClick={() => save(null, null)}>
            Clear time
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
