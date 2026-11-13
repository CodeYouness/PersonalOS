/**
 * What the Home cards added by spec #232 decide to draw: the Today card's
 * lever-or-focus line and its "Review last week" note (#241). The Close the
 * day card is gone: the check-in panel took its place (ADR 0037), tested in
 * checkin-panel.test.js. Static markup; tapping and saving are checked in the
 * browser.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

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
