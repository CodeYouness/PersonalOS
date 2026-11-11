/**
 * What the review's writing steps decide to draw (#240): the three questions
 * from the product configuration, the previous week's lever only when there
 * is one, the stored words in the fields, and Complete / Delete as the stored
 * state allows. Static markup; the saving is the route's, tested with it.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const { default: ReviewWrite, fieldsOf } = await import('@/components/ReviewWrite.js');

/** @returns {any} */
function review(/** @type {any} */ over = {}) {
  return {
    id: 'review_1',
    period: 'week',
    from: '2026-10-05',
    answers: { worked: 'Early starts.', heldBack: '', change: '' },
    lever: 'One thing first.',
    completedAt: null,
    createdAt: '2026-10-11T18:00:00.000Z',
    updatedAt: '2026-10-11T18:00:00.000Z',
    ...over,
  };
}

/** @param {any} props */
function render(props) {
  return renderToStaticMarkup(
    createElement(ReviewWrite, { period: 'week', from: '2026-10-05', review: null, previousLever: null, ...props })
  );
}

describe('writing the review', () => {
  it('asks the three questions from the configuration, with an empty form for a week with no review', () => {
    const html = render({});
    expect(html).toContain('What worked');
    expect(html).toContain('What held me back');
    expect(html).toContain('What I change next week');
    expect(html).toContain('Complete</button>');
    expect(html).not.toContain('Delete</button>');
    expect(html).not.toContain('Last week');
  });

  it('shows the stored words and offers Delete once a review exists', () => {
    const html = render({ review: review() });
    expect(html).toContain('Early starts.');
    expect(html).toContain('One thing first.');
    expect(html).toContain('Delete</button>');
  });

  it('shows the previous week’s lever only when there is one', () => {
    expect(render({ previousLever: 'Mornings for deep work.' })).toContain('Mornings for deep work.');
    expect(render({ previousLever: null })).not.toContain('lever-prev');
  });

  it('says a completed week is complete and offers no second Complete', () => {
    const html = render({ review: review({ completedAt: '2026-10-11T19:00:00.000Z' }) });
    expect(html).not.toContain('Complete</button>');
    expect(html).toContain('Corrections still save');
  });

  it('reads a missing review as empty strings, never undefined', () => {
    expect(fieldsOf(null)).toEqual({ worked: '', heldBack: '', change: '', lever: '' });
  });
});
