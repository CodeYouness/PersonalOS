/**
 * The five taps of one reading, mood or energy, as the check-in asks it
 * (ADR 0037, components/CheckinQuestions.js). Pure: which one is marked,
 * and what a tap sends back. The chosen one is marked in a neutral colour --
 * a mood or an energy is a reading of the day, not a verdict, so no green and
 * no red. `label` names the group, so the two in the check-in are told apart.
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
