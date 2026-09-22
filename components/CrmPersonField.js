/**
 * The CRM detail panel's Person field (#55): who the task is owed to, a way
 * to clear it, and a search over your people that ends in "Add '<name>'"
 * when no one has exactly that name. Enter takes the first suggestion.
 *
 * Only draws and reports: the panel does the writing. Tracked by id -- two
 * people may share a name (ADR 0018: "only if you add it twice, by hand"),
 * and hiding one because the other is linked would make them unpickable.
 *
 * @typedef {{ id: string | null, name: string, organization: string }} ShownPerson
 *   the person the field shows; `id` is null only for one just added whose
 *   id the server has not returned yet
 */

/** How many of your people the field suggests at once. */
const SUGGESTIONS = 6;

/**
 * @param {{
 *   current: ShownPerson | null,
 *   people: import('@/lib/domain/types.js').Person[],
 *   query: string,
 *   disabled: boolean,
 *   onQuery: (query: string) => void,
 *   onChoose: (person: import('@/lib/domain/types.js').Person | null) => void,
 *   onAdd: (name: string) => void,
 * }} props
 */
export default function CrmPersonField({ current, people, query, disabled, onQuery, onChoose, onAdd }) {
  const typed = normaliseName(query);
  const needle = typed.toLowerCase();
  const matches =
    typed === ''
      ? []
      : people
          .filter((candidate) => candidate.id !== current?.id)
          .filter((candidate) => normaliseName(candidate.name).toLowerCase().includes(needle))
          .slice(0, SUGGESTIONS);
  const exists = people.some((candidate) => normaliseName(candidate.name).toLowerCase() === needle);
  const canAdd = typed !== '' && !exists;

  return (
    <div className="field">
      <label className="caption" htmlFor="d-person">Person</label>
      {current !== null && (
        <div className="person-current">
          <span>{current.organization ? current.name + ' — ' + current.organization : current.name}</span>
          <button
            type="button"
            className="tag-remove"
            aria-label={'Clear ' + current.name}
            disabled={disabled}
            onClick={() => onChoose(null)}
          >
            ×
          </button>
        </div>
      )}
      <input
        id="d-person"
        className="input"
        placeholder={current === null ? 'Link a person…' : 'Someone else…'}
        autoComplete="off"
        value={query}
        disabled={disabled}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onQuery('');
            event.currentTarget.blur();
          } else if (event.key === 'Enter') {
            if (matches.length > 0) onChoose(matches[0]);
            else if (canAdd) onAdd(typed);
          }
        }}
      />
      {(matches.length > 0 || canAdd) && (
        <ul className="person-options" aria-label="Suggestions">
          {matches.map((candidate) => (
            <li key={candidate.id}>
              <button type="button" disabled={disabled} onClick={() => onChoose(candidate)}>
                {candidate.name}
                {candidate.organization && <span className="caption"> — {candidate.organization}</span>}
              </button>
            </li>
          ))}
          {canAdd && (
            <li>
              <button type="button" disabled={disabled} onClick={() => onAdd(typed)}>
                Add ‘{typed}’
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * A name as typed, with its spaces tidied: "  Giulia  Verdi " is "Giulia
 * Verdi", so the same name typed twice is recognised as the same.
 *
 * @param {string} name
 */
function normaliseName(name) {
  return name.trim().split(/\s+/).filter(Boolean).join(' ');
}
