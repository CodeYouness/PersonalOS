/**
 * What the capture log drawer shows of when a capture was said and where it
 * came from (tickets #229, #230). Static markup only.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import CaptureLogDrawer from '@/components/CaptureLogDrawer.js';

/** @param {Record<string, unknown>} row */
function render(row) {
  const capture = {
    id: 'capture_1',
    text: 'paid 4 euro for coffee',
    destination: 'finance',
    route: 'rules',
    origin: 'bar',
    createdAt: '2026-09-10T10:00:00.000Z',
    saidAt: '2026-09-10T10:00:00.000Z',
    produced: null,
    locked: false,
    ...row,
  };
  return renderToStaticMarkup(
    createElement(CaptureLogDrawer, {
      isOpen: true,
      onClose() {},
      captures: [/** @type {any} */ (capture)],
      error: null,
      onDelete() {},
      onUndo() {},
      onRefile() {},
      isCorrecting: false,
    })
  );
}

describe('CaptureLogDrawer rows', () => {
  it('shows when it was said when that was well before it was written', () => {
    const html = render({ saidAt: '2026-09-09T22:00:00.000Z' });
    expect(html).toContain('log-said');
    expect(html).toMatch(/said /);
  });

  it('shows no said caption when it was said as it was written, or within the drift', () => {
    expect(render({})).not.toContain('log-said');
    expect(render({ saidAt: '2026-09-10T09:56:00.000Z' })).not.toContain('log-said');
  });

  it('badges a capture that came through another surface, and not one from the bar', () => {
    expect(render({ origin: 'shortcut' })).toContain('badge-origin">shortcut<');
    expect(render({ origin: 'bar' })).not.toContain('badge-origin');
  });
});
