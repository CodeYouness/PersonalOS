/**
 * What the check-in's taps render (#243): the same five taps for the mood
 * and for the energy (ADR 0037). Static markup, so only the initial
 * state is checked; tapping, changing and clearing are checked in the browser.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RatingButtons } from '@/components/DayRating.js';

/** @param {number | null} value @param {string} label */
function render(value, label = 'Mood') {
  return renderToStaticMarkup(
    createElement(RatingButtons, { scale: [1, 2, 3, 4, 5], value, label, disabled: false, onPick() {} })
  );
}

describe('the mood and energy taps', () => {
  it('shows five taps and marks none for a day not given one', () => {
    const html = render(null);
    expect(html.match(/<button/g)).toHaveLength(5);
    expect(html).not.toContain('is-chosen');
  });

  it('marks only the chosen one', () => {
    const html = render(4);
    expect(html.match(/is-chosen/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>4</);
  });

  it('names the reading the taps give, so the two groups are told apart', () => {
    expect(render(null, 'Mood')).toContain('aria-label="Mood"');
    expect(render(null, 'Energy')).toContain('aria-label="Energy"');
  });
});
