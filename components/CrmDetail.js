'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import CrmPersonField from '@/components/CrmPersonField.js';
import { TEMPERATURES, URGENCY_BANDS } from '@/personalos.config.js';

/** @typedef {import('@/lib/domain/types.js').Task} Task */

/**
 * The CRM detail panel, ported from design/mockup.html's `#card-crm-detail`:
 * the selected task's own fields, edited in place (#53).
 *
 * Optimistic, unlike the Habits manager: each control writes one field of
 * one task, so the screen can show the new value at once and, if the write
 * fails, re-read the real task and put every field back to what was saved
 * (CLAUDE.md: never leave the screen telling a story that was never saved).
 * Text saves when you leave the field (the title also on Enter); Esc in a
 * field puts it back, Esc anywhere else closes the panel.
 *
 * The mockup's Band control offers "Overdue" as a button. It is three here:
 * overdue is something that happens to a task, never a band you choose
 * (docs/domain.md). Pressing a band -- even the current one -- restarts its
 * clock, which is how an overdue task is recommitted to today.
 *
 * `saved` is what the store holds as far as this panel knows -- the task as
 * it arrived, plus every write since that succeeded. Changes are measured
 * and Esc reverts against it, not against the `task` prop, which only
 * catches up once the refresh after a write has landed.
 *
 * Complete keeps the panel open, saying "Completed" with a Reopen beside it,
 * so a mis-click is undone where it was made (#54). Delete asks first, like
 * the capture log's Delete; the capture that produced the task survives.
 *
 * The Person field picks one of your people, clears it, or -- for a name
 * that is not there yet -- offers "Add '<name>'", which creates that person
 * with the name alone and links them (#55). Only you ever create a person
 * (ADR 0018); a capture only links one that exists.
 *
 * Mounted with `key={task.id}`, so selecting another task starts clean.
 *
 * @param {{
 *   task: import('@/lib/domain/types.js').Task,
 *   person: import('@/lib/domain/types.js').Person | null,
 *   people: import('@/lib/domain/types.js').Person[],
 *   provenance: string,
 *   closeHref: string,
 * }} props `closeHref` is where closing goes -- the same view, no task
 */
export default function CrmDetail({ task, person, people, provenance, closeHref }) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => editable(task));
  const [saved, setSaved] = useState(() => editable(task));
  const [newTag, setNewTag] = useState('');
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [needsResync, setNeedsResync] = useState(false);
  const [seenTask, setSeenTask] = useState(task);
  const [isCompleted, setIsCompleted] = useState(task.completedAt !== null);
  // Complete, Reopen, Delete and the person wait for each other: a Reopen
  // racing the Complete it undoes would only be refused, and two person
  // changes racing could leave the task involving both (see setTaskPerson).
  const [isActing, setIsActing] = useState(false);
  // The person shown before the refresh confirms it; `undefined` means
  // "whatever the page says" -- the `person` prop.
  const [personShown, setPersonShown] = useState(
    /** @type {import('@/components/CrmPersonField.js').ShownPerson | null | undefined} */ (undefined)
  );
  const [personQuery, setPersonQuery] = useState('');
  const [, startTransition] = useTransition();
  // Esc reverts a field and then blurs it; the blur must not save the value
  // Esc just threw away, which its handler would still see in `draft`.
  const discardingEdit = useRef(false);

  // After a failed write the refresh brings back the task as stored; only
  // then are the fields reset to it. A successful write needs no reset: the
  // draft already says what was saved. Adjusted during render, when the
  // refreshed task arrives, rather than in an effect a render later.
  if (task !== seenTask) {
    setSeenTask(task);
    setIsCompleted(task.completedAt !== null);
    setPersonShown(undefined);
    if (needsResync) {
      setDraft(editable(task));
      setSaved(editable(task));
      setNeedsResync(false);
    }
  }

  useEffect(() => {
    /** @param {KeyboardEvent} event */
    function onKeyDown(event) {
      if (event.key !== 'Escape') return;
      const target = /** @type {HTMLElement | null} */ (event.target);
      // Esc inside a field reverts that field (handled on the field); only
      // an Esc from elsewhere closes the panel.
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      router.push(closeHref, { scroll: false });
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [router, closeHref]);

  /** @param {Partial<ReturnType<typeof editable>>} fields */
  async function save(fields) {
    setDraft((current) => ({ ...current, ...fields }));
    setError(null);
    try {
      await request(taskUrl(task.id), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(fields),
      });
      setSaved((current) => ({ ...current, ...fields }));
    } catch (caught) {
      setError(messageOf(caught));
      // Back to what was last saved at once, then to what the store really
      // holds once the refresh lands -- even if that refresh fails too, the
      // screen is not left showing the value that was refused.
      setDraft(saved);
      setNeedsResync(true);
    }
    startTransition(() => router.refresh());
  }

  /**
   * Complete or reopen, shown at once. Nothing to fall back to locally: the
   * refresh that follows, win or lose, brings the task's real state.
   *
   * @param {'complete' | 'reopen'} action
   */
  async function setCompletion(action) {
    setIsActing(true);
    setIsCompleted(action === 'complete');
    setError(null);
    try {
      await request(taskUrl(task.id) + '/' + action, { method: 'POST' });
    } catch (caught) {
      setError(messageOf(caught));
      setIsCompleted(task.completedAt !== null);
    }
    setIsActing(false);
    startTransition(() => router.refresh());
  }

  async function remove() {
    const confirmed = window.confirm(
      'Delete this task? Its links go with it; the capture it came from stays. This cannot be undone.'
    );
    if (!confirmed) return;
    setIsActing(true);
    setError(null);
    try {
      await request(taskUrl(task.id), { method: 'DELETE' });
      router.push(closeHref, { scroll: false });
    } catch (caught) {
      setError(messageOf(caught));
    }
    setIsActing(false);
    startTransition(() => router.refresh());
  }

  /**
   * Link an existing person, or clear the link with null.
   *
   * @param {import('@/lib/domain/types.js').Person | null} chosen
   */
  async function choosePerson(chosen) {
    setIsActing(true);
    setPersonQuery('');
    setPersonShown(chosen);
    setError(null);
    try {
      await linkPerson(chosen?.id ?? null);
    } catch (caught) {
      setError(messageOf(caught));
      setPersonShown(undefined);
    }
    setIsActing(false);
    startTransition(() => router.refresh());
  }

  /**
   * "Add '<name>'": create the person with the name alone, then link them.
   *
   * @param {string} name
   */
  async function addPerson(name) {
    setIsActing(true);
    setPersonQuery('');
    setPersonShown({ id: null, name, organization: '' });
    setError(null);
    try {
      const { person: added } = await request('/api/people', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      await linkPerson(added.id);
    } catch (caught) {
      // If the person was created but not linked, they are not lost: typing
      // the name again now offers them.
      setError(messageOf(caught));
      setPersonShown(undefined);
    }
    setIsActing(false);
    startTransition(() => router.refresh());
  }

  /** @param {string | null} personId */
  function linkPerson(personId) {
    return request(taskUrl(task.id) + '/person', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ personId }),
    });
  }

  /** @param {'title' | 'note'} field */
  function commitText(field) {
    if (discardingEdit.current) {
      discardingEdit.current = false;
      return;
    }
    const value = field === 'title' ? draft.title.trim() : draft.note;
    if (field === 'title' && value === '') {
      setDraft((current) => ({ ...current, title: saved.title }));
      return;
    }
    if (value === saved[field]) {
      setDraft((current) => ({ ...current, [field]: value }));
      return;
    }
    save({ [field]: value });
  }

  /**
   * @param {'title' | 'note'} field
   * @param {import('react').KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>} event
   */
  function onFieldKey(field, event) {
    if (event.key === 'Escape') {
      discardingEdit.current = true;
      setDraft((current) => ({ ...current, [field]: saved[field] }));
      event.currentTarget.blur();
    } else if (event.key === 'Enter' && field === 'title') {
      event.currentTarget.blur();
    }
  }

  function addTag() {
    const tag = newTag.trim().toLowerCase();
    setNewTag('');
    if (tag === '' || draft.tags.includes(tag)) return;
    save({ tags: [...draft.tags, tag] });
  }

  return (
    <aside id="card-crm-detail" className="card span-4">
      <div className="card-head">
        <span className="eyebrow">Detail</span>
        <button
          type="button"
          className="btn-ghost"
          aria-label="Esc: close the panel"
          onClick={() => router.push(closeHref, { scroll: false })}
        >
          Esc
        </button>
      </div>
      <div className="card-body">
        {error !== null && (
          <p className="caption is-error" role="alert">
            {error}
          </p>
        )}

        <div className="field">
          <label className="caption" htmlFor="d-title">Title</label>
          <input
            id="d-title"
            className="input"
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            onBlur={() => commitText('title')}
            onKeyDown={(event) => onFieldKey('title', event)}
          />
        </div>

        <div className="field">
          <label className="caption" htmlFor="d-note">Note</label>
          <textarea
            id="d-note"
            className="input"
            value={draft.note}
            onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
            onBlur={() => commitText('note')}
            onKeyDown={(event) => onFieldKey('note', event)}
          />
        </div>

        <div className="field">
          <span className="caption">Band</span>
          <div className="segmented" role="group" aria-label="Band">
            {URGENCY_BANDS.map((band) => (
              <button
                key={band}
                type="button"
                className={'seg' + (draft.band === band ? ' is-on' : '')}
                aria-pressed={draft.band === band}
                onClick={() => save({ band: /** @type {Task['band']} */ (band) })}
              >
                {capitalise(band)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="caption">Temperature</span>
          <div className="segmented" role="group" aria-label="Temperature">
            {TEMPERATURES.map((temperature) => (
              <button
                key={temperature}
                type="button"
                className={'seg' + (draft.temperature === temperature ? ' is-on' : '')}
                aria-pressed={draft.temperature === temperature}
                onClick={() => {
                  if (draft.temperature === temperature) return;
                  save({ temperature: /** @type {Task['temperature']} */ (temperature) });
                }}
              >
                {capitalise(temperature)}
              </button>
            ))}
          </div>
        </div>

        <CrmPersonField
          current={personShown === undefined ? person : personShown}
          people={people}
          query={personQuery}
          disabled={isActing}
          onQuery={setPersonQuery}
          onChoose={choosePerson}
          onAdd={addPerson}
        />

        <div className="field">
          <label className="caption" htmlFor="d-tag">Tags</label>
          <div className="detail-tags">
            {draft.tags.map((tag) => (
              <span key={tag} className="badge badge-tag">
                {tag}
                <button
                  type="button"
                  className="tag-remove"
                  aria-label={'Remove tag ' + tag}
                  onClick={() => save({ tags: draft.tags.filter((other) => other !== tag) })}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              id="d-tag"
              className="input input-tag"
              placeholder="+ add"
              value={newTag}
              onChange={(event) => setNewTag(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addTag();
                if (event.key === 'Escape') {
                  setNewTag('');
                  event.currentTarget.blur();
                }
              }}
            />
          </div>
        </div>

        <div className="detail-actions">
          {isCompleted ? (
            <>
              <span className="caption">Completed</span>
              <button
                type="button"
                className="btn-ghost"
                disabled={isActing}
                onClick={() => setCompletion('reopen')}
              >
                Reopen
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-primary"
              disabled={isActing}
              onClick={() => setCompletion('complete')}
            >
              Complete
            </button>
          )}
          <button type="button" className="btn-danger" disabled={isActing} onClick={remove}>
            Delete
          </button>
        </div>

        <p className="caption provenance">{provenance}</p>
      </div>
    </aside>
  );
}

/** Shown when no task is selected, so the board keeps its width either way. */
export function CrmDetailEmpty() {
  return (
    <aside id="card-crm-detail" className="card span-4">
      <div className="card-head">
        <span className="eyebrow">Detail</span>
      </div>
      <div className="card-body">
        <p className="caption">Select a task to open it here.</p>
      </div>
    </aside>
  );
}

/** @param {string} id */
function taskUrl(id) {
  return '/api/tasks/' + encodeURIComponent(id);
}

/**
 * One write. Resolves to the server's JSON answer; throws with the server's
 * own message when it refuses, or a plain one when it cannot be reached.
 *
 * @param {string} url
 * @param {RequestInit} init
 * @returns {Promise<any>}
 */
async function request(url, init) {
  let response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error('Could not reach the server');
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message ?? 'Something went wrong');
  return payload;
}

/** @param {unknown} caught */
function messageOf(caught) {
  return caught instanceof Error ? caught.message : 'Something went wrong';
}

/** @param {string} word */
function capitalise(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** @param {import('@/lib/domain/types.js').Task} task */
function editable(task) {
  return {
    title: task.title,
    note: task.note,
    band: task.band,
    temperature: task.temperature,
    tags: task.tags,
  };
}
