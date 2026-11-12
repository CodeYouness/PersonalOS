/**
 * What the Close the day card's journal line renders (#235). Static markup:
 * the field, the disabled Save on an empty line, and a failed save keeping the
 * line. The save itself is checked in the browser.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { JournalLineView } from '@/components/JournalLine.js';

/** @param {Partial<Parameters<typeof JournalLineView>[0]>} props */
function render(props) {
  return renderToStaticMarkup(
    createElement(JournalLineView, {
      value: '', saving: false, saved: false, error: null, onChange() {}, onSave() {}, ...props,
    })
  );
}

describe('the journal line', () => {
  it('has Save disabled while the line is empty', () => {
    expect(render({})).toMatch(/<button[^>]*disabled/);
    expect(render({ value: '   ' })).toMatch(/<button[^>]*disabled/);
  });

  it('enables Save for a typed line', () => {
    const html = render({ value: 'A quiet day' });
    expect(html).toContain('value="A quiet day"');
    expect(html).not.toMatch(/<button[^>]*disabled/);
  });

  it('keeps the typed line in the field and says why when a save failed', () => {
    const html = render({ value: 'A quiet day', error: 'Could not reach the server' });
    expect(html).toContain('value="A quiet day"');
    expect(html).toContain('Could not reach the server');
    expect(html).toContain('role="alert"');
  });
});
