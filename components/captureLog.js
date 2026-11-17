/**
 * Opening the capture log from anywhere on a page. The drawer's open state
 * lives in `Topbar`, which listens for this event; anything else asks for it
 * by dispatching it -- Home's "Needs you" row for captures left unclassified
 * (ADR 0040) -- without importing the shell.
 */

/** The window event `Topbar` opens the capture log on. */
export const CAPTURE_LOG_OPEN_EVENT = 'personalos:open-capture-log';

/** Asks the shell to open the capture log. Browser only. */
export function openCaptureLog() {
  window.dispatchEvent(new Event(CAPTURE_LOG_OPEN_EVENT));
}
