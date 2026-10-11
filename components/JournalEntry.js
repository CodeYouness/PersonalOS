'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { messageOf, request } from '@/components/request.js';

/**
 * One journal entry on the Journal screen, with what was remembered from it
 * (#160, ADR 0027).
 *
 * Correct is offered only while nothing has been drawn from the entry: a
 * memory quotes it, so its text and day are fixed until that memory is
 * deleted. The store refuses it anyway, whoever asks. Every delete asks
 * first, and the entry's confirmation says how many memories go with it.
 * A failed write re-reads the day, so the screen never keeps showing what
 * was not saved.
 *
 * @param {{ entry: import('@/lib/store.js').JournalDayEntry, time: string, todayKey: string }} props
 *   `time` is when it was written, read in USER_TIMEZONE on the server
 */
export default function JournalEntry({ entry, time, todayKey }) {
  const router = useRouter();
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [, startTransition] = useTransition();
  const isLocked = entry.memories.length > 0;

  /**
   * One write, then the day as it really is.
   *
   * @param {string} url
   * @param {RequestInit} init
   * @returns {Promise<boolean>} whether it was saved
   */
  async function write(url, init) {
    setIsBusy(true);
    setError(null);
    let saved = true;
    try {
      await request(url, init);
    } catch (caught) {
      setError(messageOf(caught));
      saved = false;
    }
    setIsBusy(false);
    startTransition(() => router.refresh());
    return saved;
  }

  /** @param {{ text: string, date: string }} correction */
  async function correct(correction) {
    /** @type {Record<string, string>} */
    const changes = {};
    if (correction.text.trim() !== entry.text) changes.text = correction.text;
    if (correction.date !== entry.date) changes.date = correction.date;
    if (Object.keys(changes).length === 0) {
      setIsCorrecting(false);
      return;
    }
    const saved = await write('/api/journal/' + entry.id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(changes),
    });
    if (saved) setIsCorrecting(false);
  }

  async function remove() {
    if (!window.confirm(deleteQuestion(entry.memories.length))) return;
    await write('/api/journal/' + entry.id, { method: 'DELETE' });
  }

  /** @param {string} memoryId */
  async function removeMemory(memoryId) {
    if (!window.confirm('Delete this memory? The entry stays as you wrote it.')) return;
    await write('/api/memory/' + memoryId, { method: 'DELETE' });
  }

  return (
    <div className="log-item journal-entry">
      <div className="log-top">
        <span className="caption">{time}</span>
        {!isLocked && !isCorrecting && (
          <button type="button" className="link-btn" disabled={isBusy} onClick={() => setIsCorrecting(true)}>
            Correct
          </button>
        )}
        <button type="button" className="link-btn" disabled={isBusy} onClick={remove}>
          Delete
        </button>
      </div>

      {isCorrecting ? (
        <JournalCorrection
          entry={entry}
          todayKey={todayKey}
          isBusy={isBusy}
          onSave={correct}
          onCancel={() => {
            setIsCorrecting(false);
            setError(null);
          }}
        />
      ) : (
        <p className="log-text">{entry.text}</p>
      )}
      {error && <p className="receipt-error">{error}</p>}

      {isLocked && (
        <div className="journal-memories">
          <p className="caption">Remembered from this</p>
          {entry.memories.map((memory) => (
            <div key={memory.id} className="journal-line">
              <span className="badge badge-tag">{memory.type}</span>
              <span>{memory.content}</span>
              <button type="button" className="link-btn" disabled={isBusy} onClick={() => removeMemory(memory.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The entry's text and day, corrected in place. Saved together on Save;
 * Cancel puts both back.
 *
 * @param {{
 *   entry: import('@/lib/store.js').JournalDayEntry,
 *   todayKey: string,
 *   isBusy: boolean,
 *   onSave: (correction: { text: string, date: string }) => void,
 *   onCancel: () => void,
 * }} props
 */
function JournalCorrection({ entry, todayKey, isBusy, onSave, onCancel }) {
  const [text, setText] = useState(entry.text);
  const [date, setDate] = useState(entry.date);

  return (
    <form
      className="journal-write"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ text, date });
      }}
    >
      <textarea className="input" aria-label="Correct the entry" value={text} onChange={(event) => setText(event.target.value)} />
      <div className="journal-correct-actions">
        <input
          className="input"
          type="date"
          aria-label="The day it is about"
          value={date}
          max={todayKey}
          onChange={(event) => setDate(event.target.value)}
        />
        <button type="button" className="btn-ghost" disabled={isBusy} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isBusy || text.trim() === '' || date === ''}>
          Save
        </button>
      </div>
    </form>
  );
}

/**
 * What Delete asks, naming the memories that go with the entry.
 *
 * @param {number} memoryCount
 * @returns {string}
 */
function deleteQuestion(memoryCount) {
  if (memoryCount === 0) return 'Delete this entry? This cannot be undone.';
  const memories = memoryCount === 1 ? 'the memory' : 'the ' + memoryCount + ' memories';
  return 'Delete this entry and ' + memories + ' drawn from it? This cannot be undone.';
}
