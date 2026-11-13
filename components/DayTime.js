import { formatMinutes } from '@/components/format.js';

/**
 * @typedef {{ key: string, label: string }} TimeAreaOption
 */

/**
 * One − / + stepper per area, in half hours, as the check-in's time row
 * declares the day (ADR 0037, components/CheckinQuestions.js). Pure: what
 * each area shows and what a tap sends back. `time` null is a day not declared: every area reads
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
