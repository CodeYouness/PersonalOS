/**
 * What the answer panel renders (#172-#175). Rendered to static markup, so
 * what is checked is the initial markup: a state-driven change -- a chip
 * expanding after a click -- stays a check in the browser.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AnswerPanel from '@/components/AnswerPanel.js';

/** @param {Record<string, unknown>} answer */
function render(answer) {
  return renderToStaticMarkup(
    createElement(AnswerPanel, { answer: /** @type {any} */ (answer), onClose() {}, onRetry() {} })
  );
}

/** @param {Record<string, unknown>[]} citations */
function answered(citations, extra = {}) {
  return {
    question: 'What do I know?',
    outcome: 'answer',
    leftOut: false,
    summarised: null,
    statements: [{ text: 'One claim.', citations }],
    ...extra,
  };
}

describe('AnswerPanel', () => {
  it('links a citation that opens a screen, and shows how the record stands', () => {
    const html = render(
      answered([{ id: 'task_1', type: 'task', label: 'Send the quote', labels: ['overdue'], opens: '/crm?task=task_1' }])
    );

    expect(html).toContain('href="/crm?task=task_1"');
    expect(html).toContain('Task · overdue');
    expect(html).toContain('Send the quote');
  });

  it('gives a citation with no screen a button that is closed until pressed, not a link', () => {
    const html = render(
      answered([{ id: 'person_1', type: 'person', label: 'Marta', labels: [], opens: null, content: 'Marta, client' }])
    );

    expect(html).toContain('<button type="button" class="cite" aria-expanded="false"');
    expect(html).not.toContain('href=');
    expect(html).not.toContain('Marta, client');
  });

  it.each([
    ['an address on another site', 'https://example.com/x'],
    ['a protocol-relative address', '//example.com/x'],
    ['a script', 'javascript:alert(1)'],
  ])('never links %s: the citation expands in place instead', (_name, opens) => {
    const html = render(answered([{ id: 'x_1', type: 'capture', label: 'A sentence', labels: [], opens, content: 'c' }]));

    expect(html).not.toContain('href=');
    expect(html).toContain('aria-expanded="false"');
  });

  it('says a statement was left out only when one was', () => {
    expect(render(answered([], { leftOut: true }))).toContain('Something was left out');
    expect(render(answered([{ id: 'a_1', type: 'task', label: 'T', labels: [], opens: '/crm' }]))).not.toContain(
      'Something was left out'
    );
  });

  it('says what was read as monthly totals, on an answer and on "not in your data"', () => {
    const note = 'Transactions before June 2026 were read as monthly totals.';

    expect(render(answered([], { summarised: { before: '2026-06' } }))).toContain(note);
    expect(render({ question: 'q', outcome: 'not-in-data', summarised: { before: '2026-06' } })).toContain(note);
    expect(render(answered([]))).not.toContain('read as monthly totals');
  });

  it('shows the too-large refusal with no retry', () => {
    const html = render({ question: 'q', outcome: 'too-large' });

    expect(html).toContain('Too much data to ask over, even summarised. Nothing was sent.');
    expect(html).not.toContain('Try again');
  });

  it('offers a retry for a failure, and not for a question the route refused', () => {
    expect(render({ question: 'q', outcome: 'failed' })).toContain('Try again');
    expect(render({ question: 'q', outcome: 'failed', retryable: false })).not.toContain('Try again');
  });

  it('says there is no model', () => {
    expect(render({ question: 'q', outcome: 'no-model' })).toContain('No model configured');
  });
});
