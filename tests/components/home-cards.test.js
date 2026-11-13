/**
 * What the Home cards added by spec #232 decide to draw: the Today card's
 * lever-or-focus line and its "Review last week" note (#241), and the Close
 * the day card's mood and energy lines, its time steppers and open habits (#243,
 * #235, ADR 0037). Static markup;
 * tapping and saving are checked in the browser.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const { CloseDayView } = await import('@/components/CloseDayCard.js');
const { TodayFocus } = await import('@/components/TodayCard.js');

const FROM = '2026-09-28';

/** @param {any} last */
function today(last) {
  return renderToStaticMarkup(createElement(TodayFocus, { focus: 'Ship the quote', last: { from: FROM, ...last } }));
}

describe("the Today card's focus line", () => {
  it("shows last week's lever instead of the focus, with no note", () => {
    const html = today({ lever: 'Pricing page first', pending: false, started: true });
    expect(html).toContain("This week’s lever");
    expect(html).toContain('Pricing page first');
    expect(html).not.toContain('Ship the quote');
    expect(html).not.toContain('Review last week');
  });

  it('shows the focus and offers the review when last week has none', () => {
    const html = today({ lever: null, pending: true, started: false });
    expect(html).toContain('Ship the quote');
    expect(html).toContain('No lever yet');
    expect(html).toContain('Review last week');
    expect(html).toContain('href="/review?week=' + FROM + '"');
  });

  it('does not say "no lever" about a review that is started but not finished', () => {
    const html = today({ lever: null, pending: true, started: true });
    expect(html).toContain('Ship the quote');
    expect(html).not.toContain('No lever yet');
    expect(html).toContain('not finished');
    expect(html).toContain('Finish it');
  });

  it('shows the focus and no note when the completed review left no lever', () => {
    const html = today({ lever: null, pending: false, started: true });
    expect(html).toContain('Ship the quote');
    expect(html).not.toContain('Review last week');
    expect(html).not.toContain('Finish it');
  });
});

describe('the Close the day card', () => {
  const AREAS = [{ key: 'work', label: 'Work' }, { key: 'study', label: 'Study' }];

  /** @param {any} over */
  function close(over = {}) {
    return renderToStaticMarkup(
      createElement(CloseDayView, {
        date: '2026-10-07', mood: null, energy: null, time: null, areas: AREAS, step: 30, max: 1440, open: [], scale: [1, 2, 3, 4, 5], ...over,
      })
    );
  }

  it('asks for the mood and the energy, each with its own taps', () => {
    const html = close();
    expect(html).toContain('Mood');
    expect(html).toContain('Energy');
    expect(html).toContain('aria-label="Mood"');
    expect(html).toContain('aria-label="Energy"');
    expect(html.match(/rating-btn/g)).toHaveLength(10);
  });

  it('says nothing about a value for a day given neither', () => {
    expect(close()).not.toContain('You gave it');
  });

  it('says what the day was given, the mood and the energy apart', () => {
    const moodOnly = close({ mood: 4 });
    expect(moodOnly).toContain('You gave it 4');
    expect(moodOnly.match(/You gave it/g)).toHaveLength(1);
    const both = close({ mood: 4, energy: 2 });
    expect(both).toContain('You gave it 4');
    expect(both).toContain('You gave it 2');
  });

  it('offers a half-hour stepper per area and "Nothing to declare" on a day not declared', () => {
    const html = close();
    expect(html).toContain('Time');
    expect(html).toContain('aria-label="Less Work"');
    expect(html).toContain('aria-label="More Study"');
    expect(html.match(/time-step-btn/g)).toHaveLength(4);
    expect(html).toContain('Nothing to declare');
    expect(html).not.toContain('Clear time');
  });

  it('shows each area\'s declared time, the day\'s total, and no "Nothing to declare" once declared', () => {
    const html = close({ time: { work: 90 } });
    expect(html).toMatch(/Work<\/span><button[^>]*aria-label="Less Work"[^>]*>[^<]*<\/button><span class="time-value num">1h 30m</);
    // An area at zero cannot go lower; one with time can.
    expect(html).toMatch(/aria-label="Less Study" disabled=""/);
    expect(html).not.toMatch(/aria-label="Less Work" disabled=""/);
    expect(html).toContain('1h 30m declared');
    expect(html).not.toContain('Nothing to declare');
    expect(html).toContain('Clear time');
  });

  it('says a day declared with nothing had nothing', () => {
    const html = close({ time: {} });
    expect(html).toContain('Nothing declared');
    expect(html).not.toContain('Nothing to declare');
  });

  it('names the habits still open, or says nothing is left', () => {
    expect(close()).toContain('Nothing left for today.');
    const html = close({ open: [{ label: 'Read' }, { label: 'Stretch' }] });
    expect(html).toContain('Read · Stretch');
    expect(html).toContain('habits');
    expect(close({ open: [{ label: 'Read' }] })).toContain(' habit still open today');
  });
});
