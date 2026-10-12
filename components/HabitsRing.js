import { percent } from '@/components/format.js';

/** The ring's radius, matching design/mockup.html's `#card-habits` SVG. */
const RING_RADIUS = 32;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * The home Habits card's ring: today's completion over the habits scheduled
 * today. With nothing scheduled there is nothing to complete, so the ring
 * says "Day off" and draws no arc -- 0% would read as a day you failed
 * (ADR 0029).
 *
 * @param {{ ratio: number | null }} props null when nothing is scheduled today
 */
export default function HabitsRing({ ratio }) {
  return (
    <div className="ring">
      <svg width="76" height="76" aria-hidden="true">
        <circle className="ring-track" cx="38" cy="38" r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="6" />
        {ratio !== null && (
          <circle
            className="ring-progress"
            cx="38"
            cy="38"
            r={RING_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - ratio)}
          />
        )}
      </svg>
      {ratio === null ? (
        <div className="ring-value is-off">Day off</div>
      ) : (
        <div className="ring-value num">{percent(ratio)}</div>
      )}
    </div>
  );
}
