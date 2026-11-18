'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * A box you write prose in: a textarea that grows with the text, from its
 * own minimum height (the CSS's) to about 60% of the screen, then scrolls
 * inside. Every multi-line box where words are written -- the Journal, the
 * correction of an entry, the check-in's note, the review's questions, a
 * ticket's note -- is this one, so they all grow the same way.
 *
 * The height is set by script, not by CSS `field-sizing: content`: Safari
 * has that property only in its newest releases, and an iPhone a version
 * behind would get a box that never grows. The script works everywhere, and
 * one implementation keeps the phone and the desktop alike. When every
 * Safari in use has it, this can become the CSS line alone.
 *
 * It fits on every value change -- typing, a draft restored after the
 * page hydrates, the box cleared after a save, Escape putting the saved
 * text back -- and when its width changes, since a wider box wraps into
 * fewer lines. What is typed and saved is the caller's: this only sizes.
 *
 * @param {import('react').ComponentProps<'textarea'>} props
 */
export default function ProseBox({ className, ...props }) {
  const box = useRef(/** @type {HTMLTextAreaElement | null} */ (null));
  const { value } = props;

  useLayoutEffect(() => {
    if (box.current !== null) fitToText(box.current);
  }, [value]);

  // A change of width rewraps the text: a turned phone, a panel that opens,
  // a box first shown after it was hidden (no width, no height to read). The
  // height this sets fires the observer too, so only a new width refits.
  useLayoutEffect(() => {
    const node = box.current;
    if (node === null) return;
    let width = node.clientWidth;
    let live = true;
    document.fonts?.ready.then(() => {
      if (live) fitToText(node);
    });
    if (typeof ResizeObserver === 'undefined') {
      return () => {
        live = false;
      };
    }
    const observer = new ResizeObserver(() => {
      if (node.clientWidth === width) return;
      width = node.clientWidth;
      fitToText(node);
    });
    observer.observe(node);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, []);

  return <textarea {...props} ref={box} className={className === undefined ? 'input grows' : 'input grows ' + className} />;
}

/**
 * @typedef {object} Scrollable
 * @property {number} scrollTop
 * @property {Scrollable | null} parentElement
 */

/**
 * @typedef {object} TextBox the part of a textarea fitting reads and writes
 * @property {{ height: string }} style
 * @property {number} scrollHeight the content's height, padding included
 * @property {number} offsetHeight the box's height, borders included
 * @property {number} clientHeight the box's height inside its borders
 * @property {number} scrollTop
 * @property {Scrollable | null} parentElement
 */

/**
 * Sets the box's height to its text. The height goes to `auto` first so the
 * box can shrink when lines are deleted -- otherwise its own height is the
 * content it measures -- and the CSS's min-height and max-height bound the
 * result. Collapsing for that one measure can shorten the page under the
 * reader, and the browser then scrolls it up; so every scrolled container
 * above the box, the page included, and the box's own scroll are put back
 * where they were. Nothing paints in between: the caret and the view stay
 * put.
 *
 * @param {TextBox} box
 */
export function fitToText(box) {
  const kept = scrolledAbove(box);
  const ownTop = box.scrollTop;
  box.style.height = 'auto';
  // The page uses border-box sizing: the height holds the borders, which
  // scrollHeight leaves out.
  const borders = box.offsetHeight - box.clientHeight;
  box.style.height = box.scrollHeight + borders + 'px';
  box.scrollTop = ownTop;
  for (const { node, top } of kept) node.scrollTop = top;
}

/**
 * @param {TextBox} box
 * @returns {{ node: Scrollable, top: number }[]}
 */
function scrolledAbove(box) {
  /** @type {{ node: Scrollable, top: number }[]} */
  const kept = [];
  for (let node = box.parentElement; node !== null; node = node.parentElement) {
    if (node.scrollTop > 0) kept.push({ node, top: node.scrollTop });
  }
  const page = typeof document === 'undefined' ? null : document.scrollingElement;
  if (page !== null && page.scrollTop > 0 && !kept.some(({ node }) => node === page)) {
    kept.push({ node: page, top: page.scrollTop });
  }
  return kept;
}
