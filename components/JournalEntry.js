'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { messageOf, request } from '@/components/request.js';
import { MEMORY_TYPES } from '@/personalos.config.js';

/**
 * @typedef {{ key: string, type: string, content: string }} DraftProposal
 *   a proposal as you are editing it, before you accept or discard it
 */

/**
 * What "What's worth remembering?" last answered for this entry. It lives
 * only here, in the screen's state: a proposal is never stored, so a reload
 * forgets it (ADR 0027).
 *
 * @typedef {{ status: 'asking' }
 *   | { status: 'proposals', proposals: DraftProposal[], updatedAt: string }
 *   | { status: 'nothing' }
 *   | { status: 'no-model' }
 *   | { status: 'failed', message: string }} Extraction
 */

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
 * "What's worth remembering?" asks the model to read this one entry (#161)
 * and shows its proposals in place, each one's content and type yours to
 * change, or to discard. They are a reading of the entry as it stands, so a
 * saved correction throws them away. Accept writes one as a memory (#162):
 * it leaves the proposals and appears under "Remembered from this", and the
 * entry loses Correct.
 *
 * @param {{ entry: import('@/lib/store.js').JournalDayEntry, time: string, todayKey: string }} props
 *   `time` is when it was written, read in USER_TIMEZONE on the server
 */
export default function JournalEntry({ entry, time, todayKey }) {
  const router = useRouter();
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [extraction, setExtraction] = useState(/** @type {Extraction | null} */ (null));
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
    if (saved) {
      setIsCorrecting(false);
      // A memory must quote what its entry says now, not what it said.
      setExtraction(null);
    }
  }

  async function ask() {
    setExtraction({ status: 'asking' });
    try {
      const answer = await request('/api/journal/' + entry.id + '/extract', { method: 'POST' });
      if (answer.outcome === 'no-model') setExtraction({ status: 'no-model' });
      else if (answer.proposals.length === 0) setExtraction({ status: 'nothing' });
      else {
        setExtraction({
          status: 'proposals',
          updatedAt: answer.updatedAt,
          // A key is given once, when the answer arrives, and never
          // re-numbered: discarding one leaves the others' keys as they were,
          // so a selection never slides onto its neighbour.
          proposals: answer.proposals.map((/** @type {{ type: string, content: string }} */ proposal, /** @type {number} */ index) => ({
            key: String(index),
            type: proposal.type,
            content: proposal.content,
          })),
        });
      }
    } catch (caught) {
      setExtraction({ status: 'failed', message: messageOf(caught) });
    }
  }

  /**
   * Writes a proposal as a memory, carrying the `updatedAt` its entry was
   * read with: the store refuses it if the entry has changed since.
   *
   * @param {string} key
   */
  async function accept(key) {
    if (extraction?.status !== 'proposals') return;
    const proposal = extraction.proposals.find((candidate) => candidate.key === key);
    if (proposal === undefined) return;
    const saved = await write('/api/journal/' + entry.id + '/memories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: proposal.type, content: proposal.content, updatedAt: extraction.updatedAt }),
    });
    if (saved) changeProposal(key, null);
  }

  /**
   * @param {string} key
   * @param {Partial<DraftProposal> | null} change null discards it
   */
  function changeProposal(key, change) {
    setExtraction((current) => {
      if (current?.status !== 'proposals') return current;
      const proposals =
        change === null
          ? current.proposals.filter((proposal) => proposal.key !== key)
          : current.proposals.map((proposal) => (proposal.key === key ? { ...proposal, ...change } : proposal));
      return proposals.length === 0 ? null : { ...current, proposals };
    });
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

      <JournalExtract extraction={extraction} isBusy={isBusy} onAsk={ask} onChange={changeProposal} onAccept={accept} />
    </div>
  );
}

/**
 * The button and what it last answered: the proposals, "Nothing here worth
 * remembering", "No model configured", or the failure with a retry.
 *
 * @param {{
 *   extraction: Extraction | null,
 *   isBusy: boolean,
 *   onAsk: () => void,
 *   onChange: (key: string, change: Partial<DraftProposal> | null) => void,
 *   onAccept: (key: string) => void,
 * }} props
 */
function JournalExtract({ extraction, isBusy, onAsk, onChange, onAccept }) {
  const isAsking = extraction?.status === 'asking';
  return (
    <div className="journal-extract">
      <button type="button" className="btn-ghost" disabled={isAsking} onClick={onAsk}>
        {isAsking ? 'Reading…' : "What's worth remembering?"}
      </button>
      {extraction?.status === 'nothing' && <p className="caption">Nothing here worth remembering</p>}
      {extraction?.status === 'no-model' && <p className="caption">No model configured</p>}
      {extraction?.status === 'failed' && (
        <p className="caption">
          <span className="receipt-error">{extraction.message}</span>{' '}
          <button type="button" className="link-btn" onClick={onAsk}>
            Try again
          </button>
        </p>
      )}
      {extraction?.status === 'proposals' &&
        extraction.proposals.map((proposal) => (
          <div key={proposal.key} className="journal-line">
            <select
              className="input"
              aria-label="Type"
              value={proposal.type}
              onChange={(event) => onChange(proposal.key, { type: event.target.value })}
            >
              {MEMORY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <input
              className="input"
              aria-label="What to remember"
              value={proposal.content}
              onChange={(event) => onChange(proposal.key, { content: event.target.value })}
            />
            <button
              type="button"
              className="btn-ghost"
              disabled={isBusy || proposal.content.trim() === ''}
              onClick={() => onAccept(proposal.key)}
            >
              Accept
            </button>
            <button type="button" className="icon-btn" aria-label="Discard" onClick={() => onChange(proposal.key, null)}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
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
