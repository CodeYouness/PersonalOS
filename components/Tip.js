'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * The one way a chart's mark shows its exact figures (ADR 0053,
 * docs/design/ui-rules.md, Tooltips): a small popover over the mark, on hover
 * with a mouse, on keyboard focus, and on a tap.
 *
 * - **The mark is the control.** Focusable, and named by `label`, which says
 *   everything the popover says, so a screen reader needs nothing else: the
 *   popover itself is hidden from it. A `title` alone would reach neither a
 *   keyboard nor a finger.
 * - **A tap**: on a mark that is a link (`href`), the first tap shows the
 *   figures and the second follows the link; on any other mark a tap shows
 *   them and a second hides them. A tap anywhere else hides them.
 * - **A mark that does something** (`onPress`, ADR 0060) is a button: a
 *   click, a tap, Enter or Space does it, and `expanded` says whether what it
 *   opens is open. The figures still show on hover and keyboard focus, and a
 *   tap that does it also shows them -- a second tap undoes it and hides
 *   them -- so a finger reads them too.
 * - **It is never clipped and never widens the page.** It is drawn in a portal
 *   on the body with `position: fixed`, so a card's overflow cannot cut it,
 *   above the mark (below when there is no room), kept 8 px inside the
 *   viewport; a fixed box adds nothing to the page's scroll.
 * - One is open at a time; Escape, a scroll or a resize hides it.
 *
 * No dependency: React's portal and the mark's own box.
 *
 * @param {{
 *   label: string,
 *   tip: import('react').ReactNode,
 *   as?: 'span' | 'b' | 'i',
 *   href?: string,
 *   className?: string,
 *   style?: import('react').CSSProperties,
 *   current?: boolean,
 *   onPress?: () => void,
 *   expanded?: boolean,
 *   children?: import('react').ReactNode,
 * }} props `as` for a mark that is not a link; `current` marks a link as the
 *   place you are; `onPress` makes a mark that is not a link a button, and
 *   `expanded` its open state
 */
export default function Tip({ label, tip, as = 'span', href, className, style, current = false, onPress, expanded, children = null }) {
  const id = useId();
  const mark = useRef(/** @type {HTMLElement | null} */ (null));
  const popover = useRef(/** @type {HTMLDivElement | null} */ (null));
  const touched = useRef(false);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(/** @type {{ left: number, top: number } | null} */ (null));

  const hide = useCallback(() => {
    setOpen(false);
    setAt(null);
  }, []);
  const show = useCallback(() => {
    if (openTip !== null && openTip !== hide) openTip();
    openTip = hide;
    setOpen(true);
  }, [hide]);

  // Placed once it is drawn and measured: centred over the mark, inside the viewport.
  useLayoutEffect(() => {
    if (!open || mark.current === null || popover.current === null) return;
    const box = mark.current.getBoundingClientRect();
    const width = popover.current.offsetWidth;
    const height = popover.current.offsetHeight;
    const viewport = document.documentElement.clientWidth;
    const left = Math.min(Math.max(EDGE, box.left + box.width / 2 - width / 2), Math.max(EDGE, viewport - width - EDGE));
    const top = box.top - height - GAP >= EDGE ? box.top - height - GAP : box.bottom + GAP;
    setAt({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
      if (event.key === 'Escape') hide();
    };
    /** @param {PointerEvent} event */
    const onPointer = (event) => {
      if (mark.current !== null && event.target instanceof Node && !mark.current.contains(event.target)) hide();
    };
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      if (openTip === hide) openTip = null;
    };
  }, [open, hide]);

  const events = {
    /** @param {import('react').PointerEvent} event */
    onPointerDown: (event) => {
      touched.current = event.pointerType === 'touch';
    },
    /** @param {import('react').PointerEvent} event */
    onPointerEnter: (event) => {
      if (event.pointerType !== 'touch') show();
    },
    /** @param {import('react').PointerEvent} event */
    onPointerLeave: (event) => {
      if (event.pointerType !== 'touch') hide();
    },
    // Only a keyboard's focus shows it: a tap focuses too, and is the click's to handle.
    /** @param {import('react').FocusEvent<HTMLElement>} event */
    onFocus: (event) => {
      if (focusVisible(event.currentTarget)) show();
    },
    onBlur: hide,
    /** @param {import('react').MouseEvent} event */
    onClick: (event) => {
      const touch = touched.current;
      touched.current = false;
      if (href === undefined && onPress !== undefined) {
        onPress();
        if (!touch) return;
        if (open) hide();
        else show();
        return;
      }
      if (!touch) return;
      if (href !== undefined) {
        if (open) return;
        event.preventDefault();
        show();
      } else if (open) hide();
      else show();
    },
  };

  const drawn =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popover}
            id={id}
            className="tip"
            aria-hidden="true"
            style={at === null ? { left: 0, top: 0, visibility: 'hidden' } : { left: at.left, top: at.top }}
          >
            {tip}
          </div>,
          document.body
        )
      : null;

  if (href !== undefined) {
    return (
      <>
        <Link
          ref={/** @type {import('react').Ref<HTMLAnchorElement>} */ (mark)}
          href={href}
          scroll={false}
          className={className}
          style={style}
          aria-label={label}
          aria-current={current ? 'true' : undefined}
          {...events}
        >
          {children}
        </Link>
        {drawn}
      </>
    );
  }
  const Mark = as;
  const press =
    onPress === undefined
      ? {}
      : {
          /** @param {import('react').KeyboardEvent} event */
          onKeyDown: (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            onPress();
          },
        };
  return (
    <>
      <Mark
        ref={/** @type {import('react').Ref<HTMLElement>} */ (mark)}
        tabIndex={0}
        role={onPress === undefined ? 'img' : 'button'}
        aria-label={label}
        aria-expanded={onPress === undefined ? undefined : (expanded ?? false)}
        className={className}
        style={style}
        {...events}
        {...press}
      >
        {children}
      </Mark>
      {drawn}
    </>
  );
}

/**
 * A popover's figures: a head -- the day, the month, the part -- then a label
 * and its amount per line, amounts right-aligned in tabular figures, and an
 * optional note under them.
 *
 * @param {{ head: string, rows?: { label: string, value: string }[], note?: string | null }} props
 */
export function TipFigures({ head, rows = [], note = null }) {
  return (
    <>
      <span className="tip-head">{head}</span>
      {rows.length > 0 && (
        <span className="tip-rows">
          {rows.map((row, index) => (
            <span key={index} className="tip-row">
              <span className="tip-label">{row.label}</span>
              <span className="num">{row.value}</span>
            </span>
          ))}
        </span>
      )}
      {note !== null && <span className="tip-note">{note}</span>}
    </>
  );
}

/** How far a popover stays from the viewport's edge, and from its mark, in px. */
const EDGE = 8;
const GAP = 6;

/** The open popover's way to hide, so opening another hides it. @type {(() => void) | null} */
let openTip = null;

/**
 * Whether an element's focus came from a keyboard. A browser without
 * `:focus-visible` shows the figures on any focus.
 *
 * @param {HTMLElement} element
 * @returns {boolean}
 */
function focusVisible(element) {
  try {
    return element.matches(':focus-visible');
  } catch {
    return true;
  }
}
