/**
 * What the Close the day card's taps render (#243). Static markup, so only the
 * initial state is checked; tapping, changing and clearing are checked in the
 * browser.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RatingButtons } from '@/components/DayRating.js';

/** @param {number | null} value */
function render(value) {
  return renderToStaticMarkup(
    createElement(RatingButtons, { scale: [1, 2, 3, 4, 5], value, disabled: false, onPick() {} })
  );
}

describe('the rating taps', () => {
  it('shows five taps and marks none for an unrated day', () => {
    const html = render(null);
    expect(html.match(/<button/g)).toHaveLength(5);
    expect(html).not.toContain('is-chosen');
  });

  it('marks only the chosen one', () => {
    const html = render(4);
    expect(html.match(/is-chosen/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>4</);
  });
});
