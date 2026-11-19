/**
 * The one popover a chart's mark shows its figures in (ADR 0053): the mark is
 * the control -- a link, or a focusable mark named by everything the popover
 * says -- and the popover is drawn only once it is opened, on the body, so
 * the page as served carries none. Hover, focus and a tap need a browser.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import Tip, { TipFigures } from '@/components/Tip.js';

describe('Tip', () => {
  it('makes a mark focusable and names it by what its popover says', () => {
    const html = renderToStaticMarkup(
      createElement(Tip, { label: '3 Apr: spending € 12.40', tip: 'figures', as: 'i', className: 'bar', style: { width: '40%' } })
    );

    expect(html).toBe('<i tabindex="0" role="img" aria-label="3 Apr: spending € 12.40" class="bar" style="width:40%"></i>');
  });

  it('keeps a link a link, named the same, and marks the current one', () => {
    const html = renderToStaticMarkup(
      createElement(Tip, { label: 'April 2026: nothing recorded', tip: 'figures', href: '/finances?month=2026-04', current: true }, 'Apr')
    );

    expect(html).toBe('<a aria-label="April 2026: nothing recorded" aria-current="true" href="/finances?month=2026-04">Apr</a>');
  });

  it('makes a mark that does something a button, saying whether what it opens is open (ADR 0060)', () => {
    const press = () => {};
    const closed = renderToStaticMarkup(createElement(Tip, { label: 'Food: spent € 50.00', tip: 'figures', as: 'i', onPress: press }));
    const open = renderToStaticMarkup(createElement(Tip, { label: 'Food: spent € 50.00', tip: 'figures', as: 'i', onPress: press, expanded: true }));

    expect(closed).toBe('<i tabindex="0" role="button" aria-label="Food: spent € 50.00" aria-expanded="false"></i>');
    expect(open).toBe('<i tabindex="0" role="button" aria-label="Food: spent € 50.00" aria-expanded="true"></i>');
  });

  it('draws no popover until it is opened', () => {
    expect(renderToStaticMarkup(createElement(Tip, { label: 'x', tip: 'the figures' }))).not.toContain('the figures');
  });
});

describe('TipFigures', () => {
  it('reads a head, a label and its amount per line, and a note', () => {
    const html = renderToStaticMarkup(
      createElement(TipFigures, { head: 'Cash € 6,500', rows: [{ label: 'Current', value: '6,500' }], note: '1 account with no value, not counted' })
    );

    expect(html).toBe(
      '<span class="tip-head">Cash € 6,500</span><span class="tip-rows"><span class="tip-row"><span class="tip-label">Current</span><span class="num">6,500</span></span></span><span class="tip-note">1 account with no value, not counted</span>'
    );
  });

  it('leaves out the lines and the note it is not given', () => {
    expect(renderToStaticMarkup(createElement(TipFigures, { head: '5 Apr', note: 'Nothing counted' }))).toBe(
      '<span class="tip-head">5 Apr</span><span class="tip-note">Nothing counted</span>'
    );
  });
});
