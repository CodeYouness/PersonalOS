import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import FinanceSyncLine from '@/components/FinanceSyncLine.js';

describe('FinanceSyncLine', () => {
  it('renders nothing with no staleness', () => {
    expect(renderToStaticMarkup(createElement(FinanceSyncLine, { staleness: null }))).toBe('');
  });

  it('renders the age, in the warning colour when stale', () => {
    const html = renderToStaticMarkup(
      createElement(FinanceSyncLine, { staleness: { text: 'Scalable · synced 8 days ago', tone: 'warning', error: null } })
    );
    expect(html).toContain('Scalable · synced 8 days ago');
    expect(html).toContain('due');
  });

  it('renders the error beside the last good run', () => {
    const html = renderToStaticMarkup(
      createElement(FinanceSyncLine, {
        staleness: { text: 'Scalable · last synced 3 days ago', tone: 'error', error: 'Last run failed: network' },
      })
    );
    expect(html).toContain('last synced 3 days ago');
    expect(html).toContain('Last run failed: network');
    expect(html).toContain('down');
  });
});
