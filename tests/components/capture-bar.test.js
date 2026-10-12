/**
 * What the capture bar renders before anything is typed (#172). Static
 * markup: typing, asking and the answer arriving are the reducer's and the
 * browser's to check.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import CaptureBar from '@/components/CaptureBar.js';

describe('CaptureBar', () => {
  const html = renderToStaticMarkup(createElement(CaptureBar));

  it('always has the Ask toggle, off, whether or not a model is configured', () => {
    expect(html).toMatch(/<button[^>]*class="btn-ghost ask-toggle"[^>]*aria-pressed="false"/);
  });

  it('starts in capture mode with no answer panel', () => {
    expect(html).toContain('data-mode="capture"');
    expect(html).toContain('data-answer="closed"');
    expect(html).not.toContain('class="answer"');
  });

  it('invites a capture or a question', () => {
    expect(html).toContain('placeholder="Say it once — or ask a question"');
  });
});
