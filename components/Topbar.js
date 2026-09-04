/**
 * The shell's persistent top navigation, ported from design/mockup.html.
 *
 * Only Home has a screen behind it. The other five are shown, not hidden --
 * docs/roadmap.md says they're coming, and a nav item that vanished would
 * read as a bug, not as "not built yet". They render disabled instead of a
 * dead link.
 *
 * No client-side navigation state yet: with one real screen there is nothing
 * to switch between, so this stays a server component until a second screen
 * exists to switch to.
 *
 * Three elements from the mockup's topbar are left out rather than shown
 * with fake numbers: the captures count (there is no capture pipeline yet --
 * ticket #4/#6), the date caption (the Today card is about to show the real
 * one, and duplicating it here would be two places computing "today"), and
 * the (unset) command-palette shortcut. The captures toggle itself stays,
 * disabled like the nav items -- the drawer it would open (roadmap item 11)
 * doesn't exist yet either.
 */

const COMING_SOON = ['CRM', 'Habits', 'Finances', 'Nutrition & Health', 'Review'];

export default function Topbar() {
  return (
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
        <button className="log-toggle" disabled title="Not built yet">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 3.5h10M2 7h10M2 10.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          Captures
        </button>
      </div>
    </header>
  );
}
