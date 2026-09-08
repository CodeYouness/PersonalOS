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
 * owns the toggle.
 *
 * Two elements from the mockup's topbar are still left out rather than shown
 * with fake data: the date caption (the Today card is about to show the real
 * one, and duplicating it here would be two places computing "today"), and
 * the (unset) command-palette shortcut.
 */

const COMING_SOON = ['CRM', 'Habits', 'Finances', 'Nutrition & Health', 'Review'];

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
        const response = await fetch('/api/captures');
        const body = await response.json();
        if (!response.ok) throw new Error(body.message ?? 'Something went wrong');
        if (cancelled) return;
        setCaptures(Array.isArray(body.captures) ? body.captures : []);
        setLoadError(null);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not reach the server');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLogOpen]);

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
      />
    </>
  );
}
