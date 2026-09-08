# Capture Log Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the capture log drawer (built read-only in #20) its three corrective
actions — Delete (#21), Undo (#22), and File elsewhere / Refile (#23) — so a
wrong classification can be fixed instead of living forever.

**Architecture:** All three actions are store-level orchestration functions in
`lib/store.js`, composed from primitives that already exist (`getTask`,
`deleteTask`, `createLink`, `getReferrers`, `getCaptureProducedRecord`,
`isCaptureRecordLocked`) plus two new adapter primitives (`getCapture`,
`updateCapture`) that follow the exact per-id-getter / patch-field pattern
every other entity already uses. Each store function is wrapped by one route
handler under `app/api/captures/`, and the drawer gets three callback props
that `Topbar.js` wires to `fetch`. No new abstractions: this is the same
capture → memory → link → event shape the original capture route already
writes, run in reverse or sideways.

**Tech Stack:** Next.js 16 App Router route handlers, React 19 client
components, the JSON store adapter, Vitest.

**Spec:** GitHub issues
[#21](https://github.com/CodeYouness/PersonalOS/issues/21),
[#22](https://github.com/CodeYouness/PersonalOS/issues/22),
[#23](https://github.com/CodeYouness/PersonalOS/issues/23) (all part of #19);
[ADR-0013](../decisions/0013-a-capture-can-be-corrected-after-filing.md);
the "Correcting a capture" section of [`docs/domain.md`](../domain.md).

## Global Constraints

- All storage access goes through `lib/store.js` — no route touches an
  adapter or `lib/adapters/**` directly (enforced by `no-restricted-imports`
  in `eslint.config.mjs`).
- `lib/` uses relative imports only, never the `@/` alias (same ESLint rule).
- Every new `Event` payload field and every new `EVENT_TYPES` entry is added
  to `personalos.config.js`, never inlined as a bare string elsewhere.
- Undo and Refile refuse once the produced record has been touched since
  creation (`isCaptureRecordLocked`, already implemented in
  `lib/store.js:212`) — checked **server-side**, inside the store function,
  never trusted from the drawer's last fetch.
- Delete carries a confirmation step (it is the one action with no way
  back); Undo and Refile do not.
- `route` on a `Capture` is never rewritten by a correction — only
  `destination` changes, and only Refile changes it.
- Data routes declare `export const dynamic = 'force-dynamic'`.
- `npm run verify` (lint + typecheck + test + build) green before each
  ticket's commit.

---

## Ticket #21 — Delete

### Task 1: Store — `getCapture`, `deleteCaptureCascade`, `capture.deleted`

**Files:**
- Modify: `personalos.config.js` (add `'capture.deleted'` to `EVENT_TYPES`)
- Modify: `lib/adapters/contract.js` (add `getCapture` to the typedef and to
  `ADAPTER_METHODS`)
- Modify: `lib/adapters/json/index.js` (implement `getCapture`)
- Modify: `lib/store.js` (re-export `getCapture`; add
  `retractProducedRecord` (private) and `deleteCaptureCascade` (exported))
- Test: `tests/store/adapter-contract.js` (add `getCapture` coverage to the
  existing `captures` describe block)
- Test: `tests/store/capture-corrections.test.js` (new)

**Interfaces:**
- Consumes: `getCaptures`, `getTask`, `getGoal`, `deleteTask`, `deleteGoal`,
  `deleteMemoryEntry`, `deleteCapture`, `getRelated`/`getReferrers`,
  `getCaptureProducedRecord(capture)`, `isCaptureRecordLocked(record)`,
  `recordEvent` — all already in `lib/store.js`.
- Produces: `getCapture(id): Promise<Capture | null>` and
  `deleteCaptureCascade(id): Promise<void>`, both used by ticket #23's and
  #22's store functions (Task 5, Task 9) and by the route handlers below.

- [ ] **Step 1: Add the event type**

In `personalos.config.js`, extend `EVENT_TYPES`:

```js
export const EVENT_TYPES = Object.freeze([
  'task.created',
  'task.completed',
  'capture.filed',
  'capture.deleted',
  'journal.written',
  'habit.ticked',
  'goal.created',
  'goal.completed',
  'memory.saved',
  'finance.synced',
  'integration.failed',
]);
```

- [ ] **Step 2: Add `getCapture` to the contract**

In `lib/adapters/contract.js`, add this line right after the `getCaptures`
line in the `StoreAdapter` typedef block (around line 80):

```js
 * @property {(options?: { limit?: number }) => Promise<Capture[]>} getCaptures
 * @property {(id: string) => Promise<Capture | null>} getCapture
 * @property {(input: object) => Promise<Capture>} createCapture
 * @property {(id: string) => Promise<void>} deleteCapture
```

And add `'getCapture'` to `ADAPTER_METHODS`, right after `'getCaptures'`:

```js
  'getCaptures', 'getCapture', 'createCapture', 'deleteCapture',
```

- [ ] **Step 3: Write the failing contract test for `getCapture`**

In `tests/store/adapter-contract.js`, inside the existing `describe('captures', ...)`
block (around line 241), add:

```js
      it('reads a single capture by id, or null', async () => {
        const capture = await store.createCapture({ text: 'first', destination: 'memory' });

        expect(await store.getCapture(capture.id)).toEqual(capture);
        expect(await store.getCapture('capture_missing')).toBeNull();
      });
```

- [ ] **Step 4: Run it to see it fail**

Run: `npx vitest run tests/store/json-adapter.test.js`
Expected: FAIL — `store.getCapture is not a function`

- [ ] **Step 5: Implement `getCapture` in the JSON adapter**

In `lib/adapters/json/index.js`, right after the `getCaptures` method
(around line 640-642):

```js
  async getCaptures(options) {
    return mostRecent((await readState()).captures, options);
  },

  async getCapture(id) {
    return (await readState()).captures.find((capture) => capture.id === id) ?? null;
  },

```

- [ ] **Step 6: Run it to see it pass**

Run: `npx vitest run tests/store/json-adapter.test.js`
Expected: PASS

- [ ] **Step 7: Re-export from the store facade**

In `lib/store.js`, change:

```js
export const getCaptures = adapter.getCaptures;
export const createCapture = adapter.createCapture;
export const deleteCapture = adapter.deleteCapture;
```

to:

```js
export const getCaptures = adapter.getCaptures;
export const getCapture = adapter.getCapture;
export const createCapture = adapter.createCapture;
export const deleteCapture = adapter.deleteCapture;
```

- [ ] **Step 8: Write the failing test for `deleteCaptureCascade`**

Create `tests/store/capture-corrections.test.js`:

```js
/**
 * The three corrective actions on a capture -- Delete (#21), Undo (#22),
 * Refile (#23) -- exercised directly through lib/store.js, the same way
 * tests/store/json-adapter.test.js exercises the adapter it sits on.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-capture-corrections-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

describe('deleteCaptureCascade', () => {
  it('removes the capture, its memory entry, its produced task, and every link', async () => {
    const task = await store.createTask({ title: 'Reply to Marta', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Reply to Marta',
      destination: 'task',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: task.id, rel: 'about' });
    const memory = await store.createMemoryEntry({
      content: 'Reply to Marta',
      source: 'capture',
      derivedFrom: capture.id,
    });

    await store.deleteCaptureCascade(capture.id);

    expect(await store.getCapture(capture.id)).toBeNull();
    expect(await store.getTask(task.id)).toBeNull();
    expect(await store.getMemoryEntries()).not.toContainEqual(
      expect.objectContaining({ id: memory.id })
    );
    const links = await store.getLinks({});
    expect(links.some((link) => link.from === capture.id || link.to === capture.id)).toBe(false);
    expect(links.some((link) => link.from === task.id || link.to === task.id)).toBe(false);

    const events = await store.getEvents({});
    expect(events.some((event) => event.type === 'capture.deleted' && event.subject === capture.id)).toBe(
      true
    );
  });

  it('deletes a capture with no produced record just as well', async () => {
    const capture = await store.createCapture({ text: 'porridge with berries', destination: 'nutrition' });
    await store.createMemoryEntry({
      content: 'porridge with berries',
      source: 'capture',
      derivedFrom: capture.id,
    });

    await store.deleteCaptureCascade(capture.id);

    expect(await store.getCapture(capture.id)).toBeNull();
  });

  it('throws for a capture that does not exist', async () => {
    await expect(store.deleteCaptureCascade('capture_missing')).rejects.toThrow();
  });
});
```

- [ ] **Step 9: Run it to see it fail**

Run: `npx vitest run tests/store/capture-corrections.test.js`
Expected: FAIL — `store.deleteCaptureCascade is not a function`

- [ ] **Step 10: Implement `deleteCaptureCascade` in `lib/store.js`**

Add this after `isCaptureRecordLocked` at the end of `lib/store.js`:

```js
/**
 * Deletes the record a capture produced, if it has one, along with the
 * `about` link that pointed at it. Shared by Delete, Undo and Refile
 * (#21-#23): all three start by retracting whatever the capture currently
 * produced; only Refile goes on to file a new one.
 *
 * @param {import('./domain/types.js').Capture} capture
 * @returns {Promise<void>}
 */
async function retractProducedRecord(capture) {
  const record = await getCaptureProducedRecord(capture);
  if (record === null) return;
  if (capture.destination === 'task') await deleteTask(record.id);
  else if (capture.destination === 'goals') await deleteGoal(record.id);
}

/**
 * Removes a capture entirely: the sentence, its memory entry, the record it
 * produced (if any), and every link between them. The one correction with
 * no way back (ADR-0013) -- the confirmation step lives in the UI, not here.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteCaptureCascade(id) {
  const capture = await getCapture(id);
  if (capture === null) throw new Error('no capture with id ' + id);

  await retractProducedRecord(capture);

  const memoryIds = await getReferrers(capture.id, 'derived_from');
  for (const memoryId of memoryIds) {
    await deleteMemoryEntry(memoryId);
  }

  await deleteCapture(capture.id);
  await recordEvent({ type: 'capture.deleted', subject: capture.id, source: 'user' });
}
```

- [ ] **Step 11: Run it to see it pass**

Run: `npx vitest run tests/store/capture-corrections.test.js tests/store/json-adapter.test.js`
Expected: PASS, all tests

- [ ] **Step 12: Commit**

```bash
git add personalos.config.js lib/adapters/contract.js lib/adapters/json/index.js lib/store.js tests/store/adapter-contract.js tests/store/capture-corrections.test.js
git commit -m "feat(store): cascading capture delete (ticket #21)"
```

---

### Task 2: Route — `DELETE /api/captures/[id]`

**Files:**
- Create: `app/api/captures/[id]/route.js`
- Test: `tests/app/captures-id-route.test.js` (new)

**Interfaces:**
- Consumes: `deleteCaptureCascade(id)` from Task 1.
- Produces: the `[id]/route.js` file itself, which Task 6 (PATCH, refile)
  and Task 9 (undo lives in a sibling `undo/route.js`) also touch — DELETE
  and PATCH share this one file; undo does not.

- [ ] **Step 1: Write the failing route test**

Create `tests/app/captures-id-route.test.js`:

```js
/**
 * The three corrective routes under /api/captures/[id] -- DELETE (#21),
 * PATCH for refile (#23), and POST .../undo (#22) -- tested the same way
 * tests/app/capture-route.test.js tests the original capture route.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/captures/[id]/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-captures-id-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  route = await import('@/app/api/captures/[id]/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

/** @param {string} id */
function del(id) {
  return route.DELETE(new Request('http://localhost/api/captures/' + id, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  });
}

describe('DELETE /api/captures/[id]', () => {
  it('deletes the capture and everything it produced', async () => {
    const capture = await store.createCapture({ text: 'porridge', destination: 'memory' });

    const response = await del(capture.id);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(await store.getCapture(capture.id)).toBeNull();
  });

  it('reports an error for a capture that does not exist', async () => {
    const response = await del('capture_missing');
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.status).toBe('error');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/app/captures-id-route.test.js`
Expected: FAIL — cannot find module `@/app/api/captures/[id]/route.js`

- [ ] **Step 3: Implement the route**

Create `app/api/captures/[id]/route.js`:

```js
import { NextResponse } from 'next/server';

import { deleteCaptureCascade } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * Delete (#21) and Refile (#23, added later as PATCH) both act on one
 * capture by id and share this file. Undo (#22) is an action rather than a
 * field update, so it gets its own route at ./undo/route.js instead of
 * living here too.
 *
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function DELETE(request, { params }) {
  const { id } = await params;
  try {
    await deleteCaptureCascade(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[captures] could not delete capture ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/app/captures-id-route.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/captures/\[id\]/route.js tests/app/captures-id-route.test.js
git commit -m "feat(app): DELETE /api/captures/[id] (ticket #21)"
```

---

### Task 3: UI — Delete action in the drawer

**Files:**
- Modify: `components/CaptureLogDrawer.js`
- Modify: `components/Topbar.js`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: none new (client-side `fetch`).
- Produces: `CaptureLogDrawer`'s `onDelete`, `onUndo`, `onRefile` props
  (Undo and Refile wired as no-ops shaped correctly for Task 8/Task 11 to
  fill in — the buttons for those two are added in their own tasks, not
  here, but the prop shape is decided now so it does not change twice).

- [ ] **Step 1: Add the action buttons and a resilient error/list split**

In `components/CaptureLogDrawer.js`, replace the whole file with:

```jsx
import { formatTime } from '@/components/format.js';

/**
 * @typedef {object} CaptureLogRow
 * @property {string} id
 * @property {string} text
 * @property {string} destination
 * @property {'model'|'rules'} route
 * @property {string} createdAt
 * @property {{ id: string, title: string } | null} produced
 * @property {boolean} locked
 */

/**
 * The long form of the capture bar's receipt (roadmap item 11), ported from
 * design/mockup.html's `#capture-log`. Delete lands with this pass (#21);
 * Undo and File elsewhere follow in #22 and #23.
 *
 * Purely presentational: `Topbar` owns the fetch, since the same list also
 * feeds the toggle's rules-count badge whether or not the drawer is open.
 *
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   captures: CaptureLogRow[] | null,
 *   error: string | null,
 *   onDelete: (id: string) => void,
 *   onUndo: (id: string) => void,
 *   onRefile: (id: string, destination: string) => void,
 * }} props
 */
export default function CaptureLogDrawer({ isOpen, onClose, captures, error, onDelete, onUndo, onRefile }) {
  return (
    <>
      <div className={'scrim' + (isOpen ? ' is-open' : '')} onClick={onClose} />
      <aside id="capture-log" className={isOpen ? 'is-open' : ''}>
        <div className="log-head">
          <span className="eyebrow" style={{ marginRight: 'auto' }}>
            Recent captures
          </span>
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="log-body">
          {/* An action failure (a refused Undo, say) shows here without
              hiding the list underneath it -- only a load failure, where
              captures is still null, has nothing to show alongside it. */}
          {error !== null && <p className="receipt-error">{error}</p>}
          {captures === null ? (
            error === null && <p className="caption">Loading…</p>
          ) : captures.length === 0 ? (
            <p className="caption">Nothing captured yet.</p>
          ) : (
            captures.map((capture) => (
              <LogItem
                key={capture.id}
                capture={capture}
                onDelete={onDelete}
                onUndo={onUndo}
                onRefile={onRefile}
              />
            ))
          )}
        </div>
      </aside>
    </>
  );
}

/**
 * @param {{
 *   capture: CaptureLogRow,
 *   onDelete: (id: string) => void,
 *   onUndo: (id: string) => void,
 *   onRefile: (id: string, destination: string) => void,
 * }} props
 */
function LogItem({ capture, onDelete, onUndo, onRefile }) {
  return (
    <div className="log-item">
      <div className="log-top">
        <span className="badge badge-ok">{capture.destination}</span>
        <span className={'badge badge-route-' + capture.route}>{capture.route}</span>
        <span className="log-time">{formatTime(capture.createdAt)}</span>
      </div>
      <p className="log-text">&ldquo;{capture.text}&rdquo;</p>
      {capture.produced && (
        <div className="log-dest">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M2 6h8M7 3l3 3-3 3"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {capture.produced.title}
        </div>
      )}
      <div className="log-actions">
        <button
          className="danger"
          onClick={() => {
            if (
              window.confirm(
                'Delete this capture? This removes it and everything it produced, and cannot be undone.'
              )
            ) {
              onDelete(capture.id);
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
```

(`onUndo` and `onRefile` are accepted now so the prop signature is settled,
but nothing calls them yet — that lands in Task 8 and Task 11. ESLint's
`no-unused-vars` does not flag an unused destructured function parameter
that is merely not called inside the component body, only an unused
*binding*; both are used as props passed to `LogItem`, so there is nothing
to flag.)

- [ ] **Step 2: Wire the handler in `Topbar.js`**

In `components/Topbar.js`, replace the whole file with:

```jsx
'use client';

import { useEffect, useState } from 'react';

import CaptureLogDrawer from '@/components/CaptureLogDrawer.js';

/**
 * The shell's persistent top navigation, ported from design/mockup.html.
 *
 * Only Home has a screen behind it. The other five are shown, not hidden --
 * docs/roadmap.md says they're coming, and a nav item that vanished would
 * read as a bug, not as "not built yet". They render disabled instead of a
 * dead link.
 *
 * Client component now that the captures toggle opens the capture log
 * drawer (roadmap item 11): the nav items stay disabled, but the drawer's
 * open/closed state has to live somewhere, and this is the component that
 * owns the toggle -- and, since #21, the fetches behind Delete/Undo/Refile.
 *
 * Two elements from the mockup's topbar are still left out rather than shown
 * with fake data: the date caption (the Today card is about to show the real
 * one, and duplicating it here would be two places computing "today"), and
 * the (unset) command-palette shortcut.
 */

const COMING_SOON = ['CRM', 'Habits', 'Finances', 'Nutrition & Health', 'Review'];

/** @returns {Promise<import('@/components/CaptureLogDrawer.js').CaptureLogRow[]>} */
async function fetchCaptures() {
  const response = await fetch('/api/captures');
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? 'Something went wrong');
  return Array.isArray(body.captures) ? body.captures : [];
}

export default function Topbar() {
  const [isLogOpen, setLogOpen] = useState(false);
  const [captures, setCaptures] = useState(
    /** @type {import('@/components/CaptureLogDrawer.js').CaptureLogRow[] | null} */ (null)
  );
  const [loadError, setLoadError] = useState(/** @type {string | null} */ (null));

  // Loaded once on mount, not only on first open -- the toggle's rules-count
  // badge (below) is a health signal meant to be visible before the user
  // ever opens the drawer -- and reloaded every time the drawer opens, so it
  // never shows a capture list from before the user's last few captures.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchCaptures();
        if (cancelled) return;
        setCaptures(rows);
        setLoadError(null);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not reach the server');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLogOpen]);

  /**
   * Runs a correction (delete/undo/refile), then reloads the list so the
   * drawer reflects whatever actually happened -- reconstructing the row
   * locally would mean re-deriving `produced`/`locked`, which only the
   * server can cheaply compute.
   *
   * @param {string} url
   * @param {RequestInit} options
   */
  async function correct(url, options) {
    try {
      const response = await fetch(url, options);
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? 'Something went wrong');
      setCaptures(await fetchCaptures());
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not reach the server');
    }
  }

  /** @param {string} id */
  const handleDelete = (id) => correct('/api/captures/' + id, { method: 'DELETE' });
  /** @param {string} id */
  const handleUndo = (id) => correct('/api/captures/' + id + '/undo', { method: 'POST' });
  /**
   * @param {string} id
   * @param {string} destination
   */
  const handleRefile = (id, destination) =>
    correct('/api/captures/' + id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ destination }),
    });

  const rulesCount = captures?.filter((capture) => capture.route === 'rules').length ?? 0;

  return (
    <>
      <header id="topbar">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect x="1.5" y="1.5" width="17" height="17" rx="5" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M6 10.5l2.6 2.6L14 7.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="brand-name">PersonalOS</span>
        </div>

        <nav className="nav">
          <button className="nav-item" aria-current="page">
            Home
          </button>
          {COMING_SOON.map((label) => (
            <button key={label} className="nav-item" disabled title="Not built yet">
              {label}
            </button>
          ))}
        </nav>

        <div className="topbar-right">
          <button className="log-toggle" onClick={() => setLogOpen(true)}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 3.5h10M2 7h10M2 10.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Captures
            {rulesCount > 0 && <span className="count has-rules num">{rulesCount}</span>}
          </button>
        </div>
      </header>

      {/* Sibling of #topbar, not a child: #topbar's backdrop-filter creates
          a containing block for position:fixed descendants, which would
          clip the drawer and scrim to the 56px topbar strip instead of the
          viewport. */}
      <CaptureLogDrawer
        isOpen={isLogOpen}
        onClose={() => setLogOpen(false)}
        captures={captures}
        error={loadError}
        onDelete={handleDelete}
        onUndo={handleUndo}
        onRefile={handleRefile}
      />
    </>
  );
}
```

- [ ] **Step 3: Port the action-row CSS from the mockup**

In `app/globals.css`, replace:

```css
.log-dest { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--ink-subtle); }
.scrim {
```

with:

```css
.log-dest { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--ink-subtle); }
.log-actions { display: flex; gap: var(--s-xxs); margin-top: 6px; }
.log-actions button { font-size: 11px; padding: 3px 8px; border-radius: var(--r-xs); color: var(--ink-tertiary); border: 1px solid var(--hairline); background: none; }
.log-actions button:hover { color: var(--ink); border-color: var(--hairline-strong); }
.log-actions button.danger:hover { color: var(--danger); border-color: var(--danger); background: var(--danger-soft); }
.scrim {
```

- [ ] **Step 4: Run the full test suite**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 5: Manual check**

Run: `npm run dev`, open the app, open the capture log drawer, click Delete
on a row, confirm the browser dialog, verify the row disappears. Click
Delete and cancel the dialog, verify nothing changes.

- [ ] **Step 6: Commit**

```bash
git add components/CaptureLogDrawer.js components/Topbar.js app/globals.css
git commit -m "feat(app): delete a capture from the log drawer (ticket #21)"
```

---

## Ticket #22 — Undo

### Task 4: Store — `undoCaptureFiling`, `capture.undone`

**Files:**
- Modify: `personalos.config.js` (add `'capture.undone'` to `EVENT_TYPES`)
- Modify: `lib/store.js` (add `undoCaptureFiling`)
- Test: `tests/store/capture-corrections.test.js` (extend)

**Interfaces:**
- Consumes: `getCapture`, `getCaptureProducedRecord`, `isCaptureRecordLocked`,
  `retractProducedRecord` (private, from Task 1), `recordEvent`.
- Produces: `undoCaptureFiling(id): Promise<void>`, thrown-on-refusal, used
  by Task 5's route.

- [ ] **Step 1: Add the event type**

In `personalos.config.js`:

```js
  'capture.filed',
  'capture.deleted',
  'capture.undone',
  'journal.written',
```

- [ ] **Step 2: Write the failing tests**

In `tests/store/capture-corrections.test.js`, add a new `describe` block
after `deleteCaptureCascade`'s:

```js
describe('undoCaptureFiling', () => {
  it('removes the produced task but keeps the capture and its memory entry', async () => {
    const task = await store.createTask({ title: 'Book the flights', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Book the flights',
      destination: 'task',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: task.id, rel: 'about' });
    const memory = await store.createMemoryEntry({
      content: 'Book the flights',
      source: 'capture',
      derivedFrom: capture.id,
    });

    await store.undoCaptureFiling(capture.id);

    expect(await store.getTask(task.id)).toBeNull();
    expect(await store.getCapture(capture.id)).not.toBeNull();
    expect(await store.getMemoryEntries()).toContainEqual(expect.objectContaining({ id: memory.id }));

    const events = await store.getEvents({});
    expect(events.some((event) => event.type === 'capture.undone' && event.subject === capture.id)).toBe(
      true
    );
  });

  it('refuses once the produced task has been completed', async () => {
    const task = await store.createTask({ title: 'Book the flights', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Book the flights',
      destination: 'task',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: task.id, rel: 'about' });
    await store.updateTask(task.id, { completedAt: new Date(0).toISOString() });

    await expect(store.undoCaptureFiling(capture.id)).rejects.toThrow();
    expect(await store.getTask(task.id)).not.toBeNull();
  });

  it('refuses a capture with nothing produced to undo', async () => {
    const capture = await store.createCapture({ text: 'porridge', destination: 'nutrition' });

    await expect(store.undoCaptureFiling(capture.id)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/store/capture-corrections.test.js`
Expected: FAIL — `store.undoCaptureFiling is not a function`

- [ ] **Step 4: Implement `undoCaptureFiling`**

In `lib/store.js`, add after `deleteCaptureCascade`:

```js
/**
 * Reverses only the record a capture produced -- a wrongly-filed task or
 * goal disappears, but the capture and its memory entry stay, because the
 * fact you said it remains true. Refused once the produced record has been
 * touched since creation: a correction from the log must never quietly
 * erase work the user has already done on it (ADR-0013).
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function undoCaptureFiling(id) {
  const capture = await getCapture(id);
  if (capture === null) throw new Error('no capture with id ' + id);

  const record = await getCaptureProducedRecord(capture);
  if (record === null) throw new Error('this capture has no produced record to undo');
  if (isCaptureRecordLocked(record)) {
    throw new Error(
      'the produced record has been touched since it was created and can no longer be undone'
    );
  }

  await retractProducedRecord(capture);
  await recordEvent({ type: 'capture.undone', subject: capture.id, source: 'user' });
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `npx vitest run tests/store/capture-corrections.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add personalos.config.js lib/store.js tests/store/capture-corrections.test.js
git commit -m "feat(store): undo a capture's filing (ticket #22)"
```

---

### Task 5: Route — `POST /api/captures/[id]/undo`

**Files:**
- Create: `app/api/captures/[id]/undo/route.js`
- Test: `tests/app/captures-id-route.test.js` (extend)

**Interfaces:**
- Consumes: `undoCaptureFiling(id)` from Task 4.
- Produces: the undo endpoint Task 8's UI calls.

- [ ] **Step 1: Write the failing test**

In `tests/app/captures-id-route.test.js`, add near the top (after the
`route` import):

```js
/** @type {typeof import('@/app/api/captures/[id]/undo/route.js')} */
let undoRoute;
```

and inside `beforeAll`, after `route = await import(...)`:

```js
  undoRoute = await import('@/app/api/captures/[id]/undo/route.js');
```

Then add a helper and a describe block:

```js
/** @param {string} id */
function undo(id) {
  return undoRoute.POST(new Request('http://localhost/api/captures/' + id + '/undo', { method: 'POST' }), {
    params: Promise.resolve({ id }),
  });
}

describe('POST /api/captures/[id]/undo', () => {
  it('removes the produced task and keeps the capture', async () => {
    const task = await store.createTask({ title: 'Book the flights', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Book the flights',
      destination: 'task',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: task.id, rel: 'about' });

    const response = await undo(capture.id);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(await store.getTask(task.id)).toBeNull();
    expect(await store.getCapture(capture.id)).not.toBeNull();
  });

  it('reports an error when there is nothing to undo', async () => {
    const capture = await store.createCapture({ text: 'porridge', destination: 'nutrition' });

    const response = await undo(capture.id);
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/app/captures-id-route.test.js`
Expected: FAIL — cannot find module `@/app/api/captures/[id]/undo/route.js`

- [ ] **Step 3: Implement the route**

Create `app/api/captures/[id]/undo/route.js`:

```js
import { NextResponse } from 'next/server';

import { undoCaptureFiling } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * Undo (#22) is an action, not a field update, so it does not fit PATCH the
 * way Refile's destination change does -- it gets its own route rather than
 * sharing ../route.js.
 *
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function POST(request, { params }) {
  const { id } = await params;
  try {
    await undoCaptureFiling(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[captures] could not undo capture ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/app/captures-id-route.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/captures/\[id\]/undo/route.js tests/app/captures-id-route.test.js
git commit -m "feat(app): POST /api/captures/[id]/undo (ticket #22)"
```

---

### Task 6: UI — Undo button in the drawer

**Files:**
- Modify: `components/CaptureLogDrawer.js`

**Interfaces:**
- Consumes: `onUndo` prop, already threaded through since Task 3.

- [ ] **Step 1: Render the button when there is something to undo**

In `components/CaptureLogDrawer.js`, inside `LogItem`'s `.log-actions` div,
add the Undo button before the Delete button:

```jsx
      <div className="log-actions">
        {capture.produced !== null && !capture.locked && (
          <button onClick={() => onUndo(capture.id)}>Undo</button>
        )}
        <button
          className="danger"
```

`capture.locked` is only ever `true` when `capture.produced` is not `null`
(see `app/api/captures/route.js`'s `enrichCapture`), so this also correctly
hides Undo on a locked row without a second check.

- [ ] **Step 2: Run the full test suite**

Run: `npm run verify`
Expected: PASS (no new automated test for this rendering condition beyond
what Task 4/5 already cover at the store/route layer; this step is a
presentational wire-up over already-tested logic)

- [ ] **Step 3: Manual check**

Run: `npm run dev`. Capture something that becomes a task (e.g. "call the
dentist tomorrow"), open the drawer, click Undo, verify the row loses its
`log-dest` line and the task disappears from wherever it would have shown.
Complete a task produced by a capture, open the drawer, verify Undo is
absent on that row.

- [ ] **Step 4: Commit**

```bash
git add components/CaptureLogDrawer.js
git commit -m "feat(app): show the Undo action in the capture log drawer (ticket #22)"
```

---

## Ticket #23 — Refile

### Task 7: Store — `updateCapture`, `refileCapture`, `capture.refiled`

**Files:**
- Modify: `personalos.config.js` (add `'capture.refiled'` to `EVENT_TYPES`)
- Modify: `lib/adapters/contract.js` (add `updateCapture` to the typedef and
  `ADAPTER_METHODS`)
- Modify: `lib/adapters/json/index.js` (add `CAPTURE_PATCH_FIELDS` and
  `updateCapture`)
- Modify: `lib/store.js` (re-export `updateCapture`; add `refileCapture`)
- Test: `tests/store/adapter-contract.js` (extend the `captures` block)
- Test: `tests/store/capture-corrections.test.js` (extend)

**Interfaces:**
- Consumes: `getCapture`, `getCaptureProducedRecord`, `isCaptureRecordLocked`,
  `retractProducedRecord` (private), `createTask`, `createGoal`,
  `createLink`, `recordEvent`, `DESTINATIONS` from `personalos.config.js`.
- Produces: `updateCapture(id, patch): Promise<Capture>` and
  `refileCapture(id, destination): Promise<string | null>` (the new
  produced record's id, or `null`), used by Task 8's route.

- [ ] **Step 1: Add the event type**

In `personalos.config.js`:

```js
  'capture.undone',
  'capture.refiled',
  'journal.written',
```

- [ ] **Step 2: Write the failing contract tests**

In `tests/store/adapter-contract.js`, inside `describe('captures', ...)`,
add:

```js
      it('updates only the destination, and rejects any other field', async () => {
        const capture = await store.createCapture({ text: 'first', destination: 'memory' });

        const updated = await store.updateCapture(capture.id, { destination: 'nutrition' });
        expect(updated.destination).toBe('nutrition');
        // route describes how the ORIGINAL destination was decided and is
        // never rewritten by a correction (ADR-0013).
        expect(updated.route).toBe(capture.route);

        await expect(
          store.updateCapture(capture.id, /** @type {any} */ ({ text: 'rewritten' }))
        ).rejects.toThrow();
      });
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/store/json-adapter.test.js`
Expected: FAIL — `store.updateCapture is not a function`

- [ ] **Step 4: Implement `updateCapture` in the JSON adapter**

In `lib/adapters/json/index.js`, add a new patch-fields map near the other
`*_PATCH_FIELDS` constants (after `SYNC_STATE_PATCH_FIELDS`, before the
`jsonAdapter` object):

```js
const CAPTURE_PATCH_FIELDS = {
  destination: (/** @type {unknown} */ v) => requireOneOf(v, 'destination', DESTINATIONS, 'memory'),
};
```

Then, inside `jsonAdapter`, replace:

```js
  async deleteCapture(id) {
```

with:

```js
  async updateCapture(id, patch) {
    const validated = validatePatch(/** @type {Record<string, unknown>} */ (patch), CAPTURE_PATCH_FIELDS);
    return updateState((state) => applyPatch(requireById(state.captures, id, 'capture'), validated));
  },

  async deleteCapture(id) {
```

- [ ] **Step 5: Add `updateCapture` to the contract**

In `lib/adapters/contract.js`, change:

```js
 * @property {(input: object) => Promise<Capture>} createCapture
 * @property {(id: string) => Promise<void>} deleteCapture
```

to:

```js
 * @property {(input: object) => Promise<Capture>} createCapture
 * @property {(id: string, patch: object) => Promise<Capture>} updateCapture
 * @property {(id: string) => Promise<void>} deleteCapture
```

and in `ADAPTER_METHODS`, change:

```js
  'getCaptures', 'getCapture', 'createCapture', 'deleteCapture',
```

to:

```js
  'getCaptures', 'getCapture', 'createCapture', 'updateCapture', 'deleteCapture',
```

- [ ] **Step 6: Run it to see it pass**

Run: `npx vitest run tests/store/json-adapter.test.js`
Expected: PASS

- [ ] **Step 7: Re-export from the store facade**

In `lib/store.js`:

```js
export const getCaptures = adapter.getCaptures;
export const getCapture = adapter.getCapture;
export const createCapture = adapter.createCapture;
export const updateCapture = adapter.updateCapture;
export const deleteCapture = adapter.deleteCapture;
```

- [ ] **Step 8: Write the failing tests for `refileCapture`**

In `tests/store/capture-corrections.test.js`, add a `describe` block after
`undoCaptureFiling`'s. It needs `DESTINATIONS`:

```js
import { DESTINATIONS } from '../../personalos.config.js';
```

(add this import at the top of the file, alongside the other imports)

```js
describe('refileCapture', () => {
  it('retracts the old task and creates a new goal at the new destination', async () => {
    const task = await store.createTask({ title: 'Ship the pricing page', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Ship the pricing page',
      destination: 'task',
      route: 'model',
    });
    await store.createLink({ from: capture.id, to: task.id, rel: 'about' });

    const newRecordId = await store.refileCapture(capture.id, 'goals');

    expect(await store.getTask(task.id)).toBeNull();
    const goal = await store.getGoal(/** @type {string} */ (newRecordId));
    expect(goal?.name).toBe('Ship the pricing page');
    const aboutLinks = await store.getLinks({ from: capture.id, rel: 'about' });
    expect(aboutLinks.map((link) => link.to)).toEqual([newRecordId]);

    const refiled = await store.getCapture(capture.id);
    expect(refiled?.destination).toBe('goals');
    expect(refiled?.route).toBe('model');

    const events = await store.getEvents({});
    const event = events.find((entry) => entry.type === 'capture.refiled' && entry.subject === capture.id);
    expect(event?.payload).toEqual({ from: 'task', to: 'goals' });
  });

  it('retracts a produced record without creating one for a no-record destination', async () => {
    const task = await store.createTask({ title: 'Book the flights', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Book the flights',
      destination: 'task',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: task.id, rel: 'about' });

    const newRecordId = await store.refileCapture(capture.id, 'memory');

    expect(newRecordId).toBeNull();
    expect(await store.getTask(task.id)).toBeNull();
    expect((await store.getCapture(capture.id))?.destination).toBe('memory');
  });

  it('refuses once the produced record has been touched', async () => {
    const goal = await store.createGoal({ name: 'Finish the audit', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Finish the audit',
      destination: 'goals',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: goal.id, rel: 'about' });
    await store.updateGoal(goal.id, { done: true });

    await expect(store.refileCapture(capture.id, 'task')).rejects.toThrow();
    expect(await store.getGoal(goal.id)).not.toBeNull();
  });

  it('refuses filing to the current destination', async () => {
    const capture = await store.createCapture({ text: 'porridge', destination: 'nutrition' });

    await expect(store.refileCapture(capture.id, 'nutrition')).rejects.toThrow();
  });

  it('refuses an unknown destination without touching the existing record', async () => {
    const task = await store.createTask({ title: 'Book the flights', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Book the flights',
      destination: 'task',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: task.id, rel: 'about' });

    await expect(store.refileCapture(capture.id, 'errands')).rejects.toThrow();
    expect(await store.getTask(task.id)).not.toBeNull();
  });

  it('accepts every canonical destination other than the current one', () => {
    expect(DESTINATIONS.length).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 9: Run it to see it fail**

Run: `npx vitest run tests/store/capture-corrections.test.js`
Expected: FAIL — `store.refileCapture is not a function`

- [ ] **Step 10: Implement `refileCapture`**

In `lib/store.js`, add the import at the top, alongside the existing ones:

```js
import { assertImplementsContract } from './adapters/contract.js';
import { jsonAdapter } from './adapters/json/index.js';
import { DESTINATIONS } from '../personalos.config.js';
```

Then add, after `undoCaptureFiling`:

```js
/**
 * Corrects a capture's destination: retracts whatever it currently produced
 * (same as Undo), then, if the new destination is one that gets a real
 * record, creates it the same way an original capture would. `route` is
 * left untouched -- it describes how the *original* destination was
 * decided, and a correction does not rewrite history (ADR-0013).
 *
 * Destination is validated before anything is retracted: a bad value must
 * fail before the old record is gone, not after.
 *
 * @param {string} id
 * @param {string} destination one of DESTINATIONS, and not the current one
 * @returns {Promise<string | null>} the new produced record's id, or null
 */
export async function refileCapture(id, destination) {
  if (!DESTINATIONS.includes(destination)) {
    throw new Error('destination must be one of ' + DESTINATIONS.join(', ') + ', received ' + JSON.stringify(destination));
  }

  const capture = await getCapture(id);
  if (capture === null) throw new Error('no capture with id ' + id);
  if (destination === capture.destination) {
    throw new Error('this capture is already filed at ' + destination);
  }

  const record = await getCaptureProducedRecord(capture);
  if (record !== null && isCaptureRecordLocked(record)) {
    throw new Error(
      'the produced record has been touched since it was created and can no longer be refiled'
    );
  }

  await retractProducedRecord(capture);

  let recordId = null;
  if (destination === 'task') {
    const task = await createTask({ title: capture.text, source: 'capture' });
    recordId = task.id;
    await createLink({ from: capture.id, to: task.id, rel: 'about' });
  } else if (destination === 'goals') {
    const goal = await createGoal({ name: capture.text, source: 'capture' });
    recordId = goal.id;
    await createLink({ from: capture.id, to: goal.id, rel: 'about' });
  }

  await updateCapture(capture.id, { destination });
  await recordEvent({
    type: 'capture.refiled',
    subject: capture.id,
    source: 'user',
    payload: { from: capture.destination, to: destination },
  });
  return recordId;
}
```

- [ ] **Step 11: Run it to see it pass**

Run: `npx vitest run tests/store/capture-corrections.test.js tests/store/adapter-contract.js`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add personalos.config.js lib/adapters/contract.js lib/adapters/json/index.js lib/store.js tests/store/adapter-contract.js tests/store/capture-corrections.test.js
git commit -m "feat(store): refile a capture to a different destination (ticket #23)"
```

---

### Task 8: Route — `PATCH /api/captures/[id]`

**Files:**
- Modify: `app/api/captures/[id]/route.js`
- Test: `tests/app/captures-id-route.test.js` (extend)

**Interfaces:**
- Consumes: `refileCapture(id, destination)` from Task 7.
- Produces: the refile endpoint Task 9's UI calls.

- [ ] **Step 1: Write the failing test**

In `tests/app/captures-id-route.test.js`, add:

```js
/** @param {string} id, {string} destination */
function patch(id, destination) {
  return route.PATCH(
    new Request('http://localhost/api/captures/' + id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ destination }),
    }),
    { params: Promise.resolve({ id }) }
  );
}

describe('PATCH /api/captures/[id]', () => {
  it('refiles a capture to a new destination', async () => {
    const capture = await store.createCapture({ text: 'porridge', destination: 'nutrition' });

    const response = await patch(capture.id, 'health');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect((await store.getCapture(capture.id))?.destination).toBe('health');
  });

  it('reports an error for an unknown destination', async () => {
    const capture = await store.createCapture({ text: 'porridge', destination: 'nutrition' });

    const response = await patch(capture.id, 'errands');
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/app/captures-id-route.test.js`
Expected: FAIL — `route.PATCH is not a function`

- [ ] **Step 3: Implement the handler**

In `app/api/captures/[id]/route.js`, add the import and a new export:

```js
import { NextResponse } from 'next/server';

import { deleteCaptureCascade, refileCapture } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * Delete (#21) and Refile (#23) both act on one capture by id and share
 * this file. Undo (#22) is an action rather than a field update, so it gets
 * its own route at ./undo/route.js instead of living here too.
 *
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function DELETE(request, { params }) {
  const { id } = await params;
  try {
    await deleteCaptureCascade(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[captures] could not delete capture ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}

/**
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const destination = typeof body?.destination === 'string' ? body.destination : '';

  try {
    const recordId = await refileCapture(id, destination);
    return NextResponse.json({ ok: true, recordId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[captures] could not refile capture ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/app/captures-id-route.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/captures/\[id\]/route.js tests/app/captures-id-route.test.js
git commit -m "feat(app): PATCH /api/captures/[id] to refile (ticket #23)"
```

---

### Task 9: UI — "File elsewhere" select, and mark the roadmap done

**Files:**
- Modify: `components/CaptureLogDrawer.js`
- Modify: `app/globals.css`
- Modify: `docs/roadmap.md`

**Interfaces:**
- Consumes: `onRefile` prop (already threaded since Task 3), `DESTINATIONS`
  from `personalos.config.js`.

- [ ] **Step 1: Import `DESTINATIONS` and add the select**

In `components/CaptureLogDrawer.js`, add the import at the top:

```js
import { DESTINATIONS } from '@/personalos.config.js';
import { formatTime } from '@/components/format.js';
```

Then, inside `LogItem`'s `.log-actions` div, add the select between Undo
and Delete:

```jsx
      <div className="log-actions">
        {capture.produced !== null && !capture.locked && (
          <button onClick={() => onUndo(capture.id)}>Undo</button>
        )}
        {!capture.locked && (
          <select
            className="log-refile"
            value=""
            onChange={(event) => {
              if (event.target.value !== '') onRefile(capture.id, event.target.value);
            }}
          >
            <option value="">File elsewhere…</option>
            {DESTINATIONS.filter((destination) => destination !== capture.destination).map(
              (destination) => (
                <option key={destination} value={destination}>
                  {destination}
                </option>
              )
            )}
          </select>
        )}
        <button
          className="danger"
```

- [ ] **Step 2: Style the select to match the other actions**

In `app/globals.css`, replace:

```css
.log-actions button.danger:hover { color: var(--danger); border-color: var(--danger); background: var(--danger-soft); }
.scrim {
```

with:

```css
.log-actions button.danger:hover { color: var(--danger); border-color: var(--danger); background: var(--danger-soft); }
.log-actions select.log-refile { font: inherit; font-size: 11px; padding: 3px 6px; border-radius: var(--r-xs); color: var(--ink-tertiary); border: 1px solid var(--hairline); background: var(--surface-1); }
.log-actions select.log-refile:hover { color: var(--ink); border-color: var(--hairline-strong); }
.scrim {
```

- [ ] **Step 3: Mark the roadmap item done**

In `docs/roadmap.md`, change:

```
| 11 | **Capture log drawer** | The long form of the receipt: recent captures with their route, undo, refile, delete. |
```

to:

```
| 11 | **Capture log drawer** | **Done.** `components/CaptureLogDrawer.js`, `components/Topbar.js`, `app/api/captures/`. Undo and Refile are refused once the produced record has been touched (ADR-0013); Delete carries a confirmation and has no such guard. |
```

- [ ] **Step 4: Run the full test suite**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 5: Manual check**

Run: `npm run dev`. Capture something that files as a task, open the
drawer, use "File elsewhere" to move it to `goals`, verify the task
disappears and a goal with the same text appears in the goals list (once
that screen exists; otherwise verify via `data/personalos.json` or a
`GET /api/captures` refresh showing the new destination and title). Refile
a capture whose produced record was completed, verify the select is absent.

- [ ] **Step 6: Commit**

```bash
git add components/CaptureLogDrawer.js app/globals.css docs/roadmap.md
git commit -m "feat(app): file a capture elsewhere from the log drawer (ticket #23)"
```

---

## Self-Review Notes

- **Spec coverage:** every acceptance-criterion line in #21/#22/#23 maps to
  a step above: confirmation (Task 3 Step 1), cascading removal + event
  (Task 1/2), row disappearing (Task 3, list re-fetch), declining changes
  nothing (native `confirm()`, no fetch call made); Undo's existence/lock
  gating (Task 4, Task 6), server-side re-check (Task 4 Step 4, never
  trusting `capture.locked` from the client alone since the route re-derives
  it); Refile's field allow-list (Task 7 Step 4), destination swap with
  route untouched (Task 7 Step 10), retraction reuse (`retractProducedRecord`
  shared across all three), roadmap update (Task 9 Step 3).
- **Type consistency:** `deleteCaptureCascade`, `undoCaptureFiling`, and
  `refileCapture` all take a bare `id: string` first argument and resolve
  their own `Capture` via `getCapture`, matching each other and matching
  `getCaptureProducedRecord`'s existing `capture` (full object) parameter
  shape — the two are different by design (one family takes an id because
  it is the entry point, the other takes the object because its caller
  already has it).
- **No placeholders:** every step has real, complete code; nothing reads
  "add validation" or "similar to Task N" without the code itself.
