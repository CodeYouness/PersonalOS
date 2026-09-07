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
 * design/mockup.html's `#capture-log`. Read-only this pass -- Undo, File
 * elsewhere and Delete arrive with the tickets that build them (#22, #23,
 * #21); `produced`/`locked` already come back from the API so those tickets
 * don't have to touch this route again.
 *
 * Purely presentational: `Topbar` owns the fetch, since the same list also
 * feeds the toggle's rules-count badge whether or not the drawer is open.
 *
 * @param {{ isOpen: boolean, onClose: () => void, captures: CaptureLogRow[] | null, error: string | null }} props
 */
export default function CaptureLogDrawer({ isOpen, onClose, captures, error }) {
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
          {error !== null ? (
            <p className="receipt-error">Could not load recent captures: {error}</p>
          ) : captures === null ? (
            <p className="caption">Loading…</p>
          ) : captures.length === 0 ? (
            <p className="caption">Nothing captured yet.</p>
          ) : (
            captures.map((capture) => <LogItem key={capture.id} capture={capture} />)
          )}
        </div>
      </aside>
    </>
  );
}

/** @param {{ capture: CaptureLogRow }} props */
function LogItem({ capture }) {
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
    </div>
  );
}
