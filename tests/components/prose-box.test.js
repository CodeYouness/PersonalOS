/**
 * A box you write prose in grows with the text (ProseBox). There is no
 * browser here, so the fitting is checked against a stand-in that measures
 * the way a textarea does: `auto` collapses it to its minimum, a set height
 * is clamped between the CSS's minimum and maximum, and the content's
 * height is read back through scrollHeight. What the box renders is checked
 * as static markup; the real growing is a check in a browser.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import ProseBox, { fitToText } from '@/components/ProseBox.js';

const BORDERS = 2;
const MIN = 104;
const MAX = 480;

/**
 * @param {{ content: number, height?: number, ownTop?: number, parent?: any }} start
 *   `content` the text's height with padding, in px
 */
function textBox({ content, height = MIN, ownTop = 0, parent = null }) {
  let outer = height;
  const style = {
    /** @type {string} */
    _height: height + 'px',
    get height() {
      return this._height;
    },
    set height(value) {
      this._height = value;
      outer = value === 'auto' ? MIN : Math.min(MAX, Math.max(MIN, parseFloat(value)));
      // A collapsed box shortens the page: a scrolled parent is pulled back.
      if (value === 'auto' && parent !== null) parent.scrollTop = 0;
    },
  };
  return {
    style,
    content,
    scrollTop: ownTop,
    parentElement: parent,
    get offsetHeight() {
      return outer;
    },
    get clientHeight() {
      return outer - BORDERS;
    },
    get scrollHeight() {
      return Math.max(this.content, outer - BORDERS);
    },
  };
}

describe('fitting a box to its text', () => {
  it('grows to the text, borders included', () => {
    const box = textBox({ content: 250 });
    fitToText(box);
    expect(box.style.height).toBe('252px');
    expect(box.offsetHeight).toBe(252);
  });

  it('shrinks back when lines are deleted, which it could not without collapsing first', () => {
    const box = textBox({ content: 250 });
    fitToText(box);
    box.content = 130;
    fitToText(box);
    expect(box.offsetHeight).toBe(132);
  });

  it('goes back to its minimum when the text is cleared after a save', () => {
    const box = textBox({ content: 250 });
    fitToText(box);
    box.content = 0;
    fitToText(box);
    expect(box.offsetHeight).toBe(MIN);
  });

  it('stops at the maximum and keeps where its own text was scrolled to', () => {
    const box = textBox({ content: 900, height: MAX, ownTop: 300 });
    fitToText(box);
    expect(box.offsetHeight).toBe(MAX);
    expect(box.scrollTop).toBe(300);
  });

  it('puts back the scroll of every container above it, so the page does not jump', () => {
    const page = { scrollTop: 800, parentElement: null };
    const panel = { scrollTop: 120, parentElement: page };
    const box = textBox({ content: 250, parent: panel });
    fitToText(box);
    expect(panel.scrollTop).toBe(120);
    expect(page.scrollTop).toBe(800);
  });
});

describe('the box', () => {
  it('is a field that grows, and passes on what the caller gives it', () => {
    const html = renderToStaticMarkup(
      createElement(ProseBox, { 'aria-label': 'Write about this day', placeholder: 'What happened?', value: 'A good day.', onChange: () => {} })
    );
    expect(html).toContain('<textarea');
    expect(html).toContain('class="input grows"');
    expect(html).toContain('aria-label="Write about this day"');
    expect(html).toContain('placeholder="What happened?"');
    expect(html).toContain('A good day.');
  });

  it('keeps a class of the caller beside its own', () => {
    const html = renderToStaticMarkup(createElement(ProseBox, { className: 'wide', value: '', onChange: () => {} }));
    expect(html).toContain('class="input grows wide"');
  });
});
