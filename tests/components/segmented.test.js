/**
 * A segmented control of links (docs/design/ui-rules.md): one joined box, a
 * group named by what it chooses, each segment a link to the place with that
 * choice, the chosen one marked `is-on` and `aria-current`. The addresses
 * here are invented.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import Segmented from '@/components/Segmented.js';

describe('Segmented', () => {
  it('draws one named group of links, the chosen one current', () => {
    const html = renderToStaticMarkup(
      createElement(Segmented, {
        label: 'Period',
        options: [
          { key: 'month', href: '/finances', on: true, children: 'Month' },
          { key: 'year', href: '/finances?period=year', on: false, children: 'Year' },
        ],
      })
    );

    expect(html).toBe(
      '<div class="segmented is-joined" role="group" aria-label="Period">' +
        '<a class="seg is-on" aria-current="true" href="/finances">Month</a>' +
        '<a class="seg" href="/finances?period=year">Year</a>' +
        '</div>'
    );
  });

  it('adds a class of its own and keeps what a segment holds, a glyph included', () => {
    const html = renderToStaticMarkup(
      createElement(Segmented, {
        label: 'View',
        className: 'finance-view-switch',
        options: [{ key: 'circle', href: '/finances', on: false, children: [createElement('svg', { key: 'glyph', 'aria-hidden': 'true' }), 'Circle'] }],
      })
    );

    expect(html).toBe(
      '<div class="segmented is-joined finance-view-switch" role="group" aria-label="View"><a class="seg" href="/finances"><svg aria-hidden="true"></svg>Circle</a></div>'
    );
  });
});
