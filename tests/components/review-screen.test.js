/**
 * What the Review screen's figures and reread decide to draw (#239). Static
 * markup: the week's figures come from weekFigures, tested in
 * derive-week.test.js; this checks that unknown is never drawn as zero, that
 * "so far" appears only for the week in progress, and that each task, goal and
 * entry opens its own screen.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import ReviewFigures from '@/components/ReviewFigures.js';
import ReviewReread from '@/components/ReviewReread.js';
import ReviewWeekNav from '@/components/ReviewWeekNav.js';
import { setDefaultTimezone } from '@/lib/domain/dates.js';
import { weekFigures } from '@/lib/domain/derive/week.js';
import { resolveReviewWeek } from '@/lib/domain/review-week.js';

setDefaultTimezone('Europe/Rome');

/** @returns {any} */
function figures(/** @type {any} */ over = {}, today = '2026-10-14', from = '2026-10-05') {
  return weekFigures({
    profile: { habits: [] },
    dailyLogs: [],
    tasks: [],
    goals: [],
    journalEntries: [],
    transactions: [],
    categories: [],
    captures: [],
    from,
    today,
    timezone: 'Europe/Rome',
    ...over,
  });
}

describe('the week at a glance', () => {
  it('shows an empty week as unknowns, never zeros', () => {
    const html = renderToStaticMarkup(createElement(ReviewFigures, { figures: figures() }));
    expect(html).toContain('no spending recorded');
    expect(html).toContain('no meals recorded');
    expect(html).toContain('no mood given');
    expect(html).toContain('no energy given');
    expect(html).not.toMatch(/>0</);
    expect(html).not.toContain('So far');
  });

  it('says how many of the four earlier weeks had spending (story 41)', () => {
    const spending = (/** @type {number} */ weeks) => ({
      total: 100,
      baseline: { mean: weeks === 0 ? null : 80, weeks },
      topCategories: [],
    });
    const render = (/** @type {number} */ weeks) =>
      renderToStaticMarkup(createElement(ReviewFigures, { figures: { ...figures(), spending: spending(weeks) } }));
    expect(render(2)).toContain('Only 2 of the 4 weeks before had spending');
    expect(render(2)).toContain('Average, 2 weeks');
    expect(render(1)).toContain('Average, 1 week<');
    expect(render(4)).not.toContain('Only');
    const none = render(0);
    expect(none).not.toContain('Average, 4 weeks');
    expect(none).toContain('none of the 4 weeks before had spending');
  });

  it('shows the mood and the energy apart, each with its own days', () => {
    const log = (/** @type {string} */ date, /** @type {any} */ over) => ({ date, habits: {}, meals: [], measurements: [], notes: [], mood: null, energy: null, ...over });
    const html = renderToStaticMarkup(
      createElement(ReviewFigures, {
        figures: figures({ dailyLogs: [log('2026-10-05', { mood: 4, energy: 2 }), log('2026-10-06', { mood: 3 })] }),
      })
    );
    expect(html).toMatch(/Mood<\/div><div class="v num reading">2\u2009\/\u20097 <span class="caption">avg 3.5</);
    expect(html).toMatch(/Energy<\/div><div class="v num reading">1\u2009\/\u20097 <span class="caption">avg 2.0</);
  });

  it('says "so far" for the week in progress', () => {
    const html = renderToStaticMarkup(
      createElement(ReviewFigures, { figures: figures({}, '2026-10-07', '2026-10-05') })
    );
    expect(html).toContain('So far');
  });

  it('links a task and a goal to their own screens', () => {
    const task = { id: 'task_1', title: 'Reply', band: 'today', bandSetOn: '2026-10-01', completedAt: null };
    const goal = {
      id: 'goal_1', name: 'Ship it', done: false, horizon: 'week', horizonSetOn: '2026-09-21', updatedAt: '2026-09-21T08:00:00.000Z',
    };
    const html = renderToStaticMarkup(
      createElement(ReviewFigures, { figures: figures({ tasks: [task], goals: [goal] }) })
    );
    expect(html).toContain('href="/crm?task=task_1"');
    expect(html).toContain('href="/goals?goal=goal_1"');
  });
});

describe('the reread', () => {
  it('says plainly when the week has no entries', () => {
    const html = renderToStaticMarkup(createElement(ReviewReread, { entries: [] }));
    expect(html).toContain('No journal entries this week.');
  });

  it('opens each entry on its day of the Journal screen', () => {
    const entry = { id: 'journal_1', date: '2026-10-06', text: 'A quiet day.', saidAt: '2026-10-06T19:40:00.000Z' };
    const html = renderToStaticMarkup(createElement(ReviewReread, { entries: [/** @type {any} */ (entry)] }));
    expect(html).toContain('href="/journal?date=2026-10-06"');
    expect(html).toContain('A quiet day.');
    expect(html).toContain('1 entry');
  });
});

describe('the week stepper', () => {
  it('disables next on the week containing today', () => {
    const html = renderToStaticMarkup(
      createElement(ReviewWeekNav, { week: resolveReviewWeek('2026-10-05', '2026-10-07') })
    );
    expect(html).toMatch(/<button[^>]*disabled[^>]*aria-label="Next week"|aria-label="Next week"[^>]*disabled/);
    expect(html).toContain('href="/review?week=2026-09-28"');
    expect(html).toContain('5 Oct – 11 Oct');
  });

  it('links next on an older week', () => {
    const html = renderToStaticMarkup(
      createElement(ReviewWeekNav, { week: resolveReviewWeek('2026-09-28', '2026-10-07') })
    );
    expect(html).toContain('href="/review?week=2026-10-05"');
  });
});
