'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { messageOf, request } from '@/components/request.js';
import { REVIEW_QUESTIONS } from '@/personalos.config.js';

/** @typedef {import('@/lib/domain/types.js').Review} Review */

/**
 * The fields a review holds that you write, as the form edits them.
 * @typedef {{ worked: string, heldBack: string, change: string, lever: string }} Fields
 */

/**
 * What the form shows for a stored review (or none): every field a string.
 *
 * @param {Review | null} review
 * @returns {Fields}
 */
export function fieldsOf(review) {
  return {
    worked: review?.answers.worked ?? '',
    heldBack: review?.answers.heldBack ?? '',
    change: review?.answers.change ?? '',
    lever: review?.lever ?? '',
  };
}

/**
 * The draft after a refused write: the `failed` fields show what the store
 * holds, every other field keeps what is being typed in it (story 66).
 *
 * @param {Fields} draft
 * @param {Fields} stored
 * @param {(keyof Fields)[]} failed
 * @returns {Fields}
 */
export function draftAfterFailure(draft, stored, failed) {
  const next = { ...draft };
  for (const key of failed) next[key] = stored[key];
  return next;
}

/**
 * Steps 3 and 4 of the Review screen (#240, spec #232): the three questions,
 * the one lever with the previous week's lever above it, and Complete and
 * Delete. Every field is optional and saves when you leave it, sending only
 * that field, so an answer and a lever saved a moment apart both land.
 *
 * The optimistic pattern (docs/architecture.md, Data flow): the field keeps
 * what you typed while the write runs. If it is refused -- an over-long
 * answer says so in the server's own words -- the form re-reads the review
 * from the store and puts the failed field back to that, so it never claims
 * a save that did not happen -- the other fields' unsaved typing is left alone. Complete records the week once; afterwards the fields stay
 * correctable and a completed week says so. Delete asks first.
 *
 * Mounted with `key={from}`, so another week starts clean.
 *
 * @param {{
 *   period: string,
 *   from: string,
 *   review: Review | null,
 *   previousLever: string | null,
 * }} props
 */
export default function ReviewWrite({ period, from, review, previousLever }) {
  const router = useRouter();
  const address = '/api/reviews/' + period + '/' + from;
  const [draft, setDraft] = useState(() => fieldsOf(review));
  const [saved, setSaved] = useState(() => fieldsOf(review));
  const [completedAt, setCompletedAt] = useState(review?.completedAt ?? null);
  const [exists, setExists] = useState(review !== null);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [isActing, setIsActing] = useState(false);
  const [, startTransition] = useTransition();

  /**
   * What the store really holds, after a failed write. Only the fields named
   * in `failed` go back to the stored text; what you are typing in another
   * field stays, and saves on its own blur. `saved` always follows the store,
   * so that blur compares against what is really there.
   *
   * @param {(keyof Fields)[]} failed
   */
  async function reread(failed) {
    try {
      const payload = await request(address, { method: 'GET' });
      const stored = fieldsOf(payload.review);
      setDraft((now) => draftAfterFailure(now, stored, failed));
      setSaved(stored);
      setCompletedAt(payload.review?.completedAt ?? null);
      setExists(payload.review !== null);
    } catch {
      // The server cannot be reached: the screen keeps the error it has.
    }
  }

  /**
   * One write, the shape all three share: clear the error, send, and on a
   * refusal say so and re-read the store; either way refresh the page.
   *
   * @param {() => Promise<void>} send the request and the state it settles
   * @param {{ failed?: (keyof Fields)[], acting?: boolean }} [options]
   *   `failed`: the fields to put back to the stored text; `acting`: disable the buttons meanwhile
   */
  async function write(send, { failed = [], acting = false } = {}) {
    if (acting) setIsActing(true);
    setError(null);
    try {
      await send();
    } catch (caught) {
      setError(messageOf(caught));
      await reread(failed);
    }
    if (acting) setIsActing(false);
    startTransition(() => router.refresh());
  }

  /** @param {keyof Fields} key */
  async function commit(key) {
    const value = draft[key];
    if (value === saved[key]) return;
    const body = key === 'lever' ? { lever: value } : { answers: { [key]: value } };
    await write(
      async () => {
        await request(address, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        setSaved((now) => ({ ...now, [key]: value }));
        setExists(true);
      },
      { failed: [key] }
    );
  }

  async function complete() {
    await write(
      async () => {
        const payload = await request(address, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ completed: true }),
        });
        setCompletedAt(payload.review.completedAt);
        setExists(true);
      },
      { acting: true }
    );
  }

  async function remove() {
    const confirmed = window.confirm(
      'Delete this review? Your answers and lever go with it. This cannot be undone.'
    );
    if (!confirmed) return;
    await write(
      async () => {
        await request(address, { method: 'DELETE' });
        const empty = fieldsOf(null);
        setDraft(empty);
        setSaved(empty);
        setCompletedAt(null);
        setExists(false);
      },
      { acting: true }
    );
  }

  return (
    <>
      <section className="review-step" id="review-questions">
        <div className="step-head">
          <span className="n">3</span>
          <h3 className="title">Three questions</h3>
          <span className="caption">All optional &middot; saved when you leave the field</span>
        </div>
        {REVIEW_QUESTIONS.map(({ key, label }) => (
          <div className="question" key={key}>
            <label htmlFor={'review-' + key}>{label}</label>
            <textarea
              id={'review-' + key}
              className="input"
              value={draft[key]}
              onChange={(event) => setDraft((now) => ({ ...now, [key]: event.target.value }))}
              onBlur={() => commit(key)}
            />
          </div>
        ))}
      </section>

      <section className="review-step" id="review-lever">
        <div className="step-head">
          <span className="n">4</span>
          <h3 className="title">One lever</h3>
          <span className="caption">For the week after &mdash; it shows on Home from Monday</span>
        </div>
        {previousLever !== null && (
          <div className="lever-prev">
            <span className="eyebrow">Last week&rsquo;s lever</span>
            <p>{previousLever}</p>
          </div>
        )}
        <input
          className="input"
          type="text"
          aria-label="Lever"
          value={draft.lever}
          onChange={(event) => setDraft((now) => ({ ...now, lever: event.target.value }))}
          onBlur={() => commit('lever')}
        />
        {error !== null && (
          <p className="review-error" role="alert">
            {error}
          </p>
        )}
        <div className="review-actions">
          <span className="caption">
            {completedAt === null
              ? 'Completing records the week once; you can still correct it after.'
              : 'Complete. Corrections still save when you leave a field.'}
          </span>
          {exists && (
            <button type="button" className="btn-danger" onClick={remove} disabled={isActing}>
              Delete
            </button>
          )}
          {completedAt === null && (
            <button type="button" className="btn-primary" onClick={complete} disabled={isActing}>
              Complete
            </button>
          )}
        </div>
      </section>
    </>
  );
}
