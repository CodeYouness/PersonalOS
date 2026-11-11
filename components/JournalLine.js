'use client';

import { useState } from 'react';

import { messageOf, request } from '@/components/request.js';

/**
 * The line's field and Save, and what sits under them. Pure: the typed text,
 * whether a save is running, and the last outcome come in as props.
 *
 * @param {{
 *   value: string,
 *   saving: boolean,
 *   saved: boolean,
 *   error: string | null,
 *   onChange: (text: string) => void,
 *   onSave: () => void,
 * }} props
 */
export function JournalLineView({ value, saving, saved, error, onChange, onSave }) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="line">
        <input
          className="input"
          type="text"
          value={value}
          placeholder="Saved as an ordinary journal entry on today"
          aria-label="One line for the journal"
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="submit" className="btn-ghost" disabled={saving || value.trim() === ''}>
          Save
        </button>
      </div>
      {error ? (
        <span className="caption" role="alert">
          {error}. The line is still here.
        </span>
      ) : (
        <span className="caption">{saved ? "Saved to today's journal." : 'If the save fails, the line stays here.'}</span>
      )}
    </form>
  );
}

/**
 * One line for the journal (#235). POSTs to the Journal's own route with
 * today's day, so it becomes an ordinary entry; nothing marks it as coming
 * from this card. The line being typed lives in this component's state only
 * -- not in browser storage -- and a failed save leaves it in the field.
 *
 * @param {{ date: string }} props
 */
export default function JournalLine({ date }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  async function save() {
    if (saving || text.trim() === '') return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await request('/api/journal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date, text }),
      });
      setText('');
      setSaved(true);
    } catch (caught) {
      setError(messageOf(caught));
    }
    setSaving(false);
  }

  return (
    <JournalLineView
      value={text}
      saving={saving}
      saved={saved}
      error={error}
      onChange={(next) => {
        setText(next);
        setSaved(false);
      }}
      onSave={save}
    />
  );
}
