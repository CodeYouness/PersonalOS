'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import CaptureLogDrawer from '@/components/CaptureLogDrawer.js';

/**
 * The shell's persistent top navigation, ported from design/mockup.html.
 *
 * Home and Habits (#38) have screens behind them and are links. The other
 * four are shown, not hidden -- docs/roadmap.md says they're coming, and a
 * nav item that vanished would read as a bug, not as "not built yet". They
 * render disabled instead of a dead link.
 *
 * Client component because the captures toggle opens the capture log drawer
 * (roadmap item 11) and this is where that open/closed state lives -- along
 * with, since #21, the fetches behind Delete/Undo/Refile, and since #38 the
 * `usePathname` that decides which nav item is the current one.
 *
 * Two elements from the mockup's topbar are still left out rather than shown
 * with fake data: the date caption (the Today card is about to show the real
 * one, and duplicating it here would be two places computing "today"), and
 * the (unset) command-palette shortcut.
 */

/**
 * The mockup's nav, in its order. A screen with an `href` is a link; one
 * without is not built yet and renders disabled in place, so graduating a
 * screen never shuffles the positions of the others.
 */
const SCREENS = [
  { label: 'Home', href: '/' },
  { label: 'CRM', href: null },
  { label: 'Habits', href: '/habits' },
  { label: 'Finances', href: null },
  { label: 'Nutrition & Health', href: null },
  { label: 'Review', href: null },
];

/** @returns {Promise<import('@/components/CaptureLogDrawer.js').CaptureLogRow[]>} */
async function fetchCaptures() {
  const response = await fetch('/api/captures');
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? 'Something went wrong');
  return Array.isArray(body.captures) ? body.captures : [];
}

export default function Topbar() {
  const pathname = usePathname();
  const [isLogOpen, setLogOpen] = useState(false);
  const [captures, setCaptures] = useState(
    /** @type {import('@/components/CaptureLogDrawer.js').CaptureLogRow[] | null} */ (null)
  );
  const [loadError, setLoadError] = useState(/** @type {string | null} */ (null));
  const [isCorrecting, setIsCorrecting] = useState(false);

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
   * server can cheaply compute. Always refreshes, win or lose: a failed
   * write must never leave the screen telling a story that was never
   * saved (CLAUDE.md) -- the action might have partially succeeded before
   * failing.
   *
   * @param {string} url
   * @param {RequestInit} options
   */
  async function correct(url, options) {
    if (isCorrecting) return;
    setIsCorrecting(true);
    let actionError = null;
    try {
      const response = await fetch(url, options);
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? 'Something went wrong');
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Could not reach the server';
    }

    try {
      setCaptures(await fetchCaptures());
      setLoadError(actionError);
    } catch (error) {
      setLoadError(actionError ?? (error instanceof Error ? error.message : 'Could not reach the server'));
    } finally {
      setIsCorrecting(false);
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
          {SCREENS.map((screen) =>
            screen.href === null ? (
              <button key={screen.label} className="nav-item" disabled title="Not built yet">
                {screen.label}
              </button>
            ) : (
              <Link
                key={screen.label}
                href={screen.href}
                className="nav-item"
                aria-current={pathname === screen.href ? 'page' : undefined}
              >
                {screen.label}
              </Link>
            )
          )}
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
        isCorrecting={isCorrecting}
      />
    </>
  );
}
