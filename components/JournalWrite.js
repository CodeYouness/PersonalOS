'use client';

import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore, useTransition } from 'react';

import { readDraft, writeDraft } from '@/components/journal.js';
import { messageOf, request } from '@/components/request.js';

/**
 * The Journal's write box (#159). What you save lands on the day on
 * screen -- to write about yesterday, step back a day first. What you type
 * is kept in this browser for that day until it is saved or cleared, so a
 * nav click or a closed tab never loses it; the screen mounts one box per
 * day, so yesterday's half-written entry never shows in today's.
 *
 * @param {{ dayKey: string, placeholder: string }} props
 */
export default function JournalWrite({ dayKey, placeholder }) {
  const router = useRouter();
  // The saved draft is read from the browser once hydrated -- the server has
  // none, so it renders the empty box first. What you type from then on is
  // this box's own state, so a browser that blocks storage still has a box
  // that works.
  const stored = useSyncExternalStore(subscribeToNothing, () => readDraft(dayKey), () => '');
  const [typed, setTyped] = useState(/** @type {string | null} */ (null));
  const draft = typed ?? stored;
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [isSaving, setIsSaving] = useState(false);
  const [, startTransition] = useTransition();

  /** @param {string} text */
  function change(text) {
    setTyped(text);
    writeDraft(dayKey, text);
  }

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function save(event) {
    event.preventDefault();
    if (draft.trim() === '' || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await request('/api/journal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date: dayKey, text: draft }),
      });
      change('');
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(messageOf(caught));
    }
    setIsSaving(false);
  }

  return (
    <form className="journal-write" onSubmit={save}>
      <textarea
        className="input"
        aria-label="Write about this day"
        placeholder={placeholder}
        value={draft}
        onChange={(event) => change(event.target.value)}
      />
      {error && <p className="receipt-error">{error}</p>}
      <button type="submit" className="btn-primary" disabled={isSaving || draft.trim() === ''}>
        Save
      </button>
    </form>
  );
}

/**
 * The draft is read once per mount; another tab's typing is not followed.
 *
 * @returns {() => void}
 */
function subscribeToNothing() {
  return () => {};
}
