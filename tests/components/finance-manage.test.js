/**
 * Manage, at the bottom of Finances (ADR 0048): adding an account, the
 * categories and the settings, each folded until opened -- by itself only
 * when it is the first thing to do. What the address selects (an account,
 * a transaction) opens its panel beside the card it is picked from, never
 * here. Static markup, as the server renders it.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import FinanceManage from '@/components/FinanceManage.js';

/** @param {{ accountCount?: number, categoryCount?: number }} [counts] */
function render({ accountCount = 20, categoryCount = 90 } = {}) {
  return renderToStaticMarkup(
    createElement(FinanceManage, {
      accountCount,
      categoryCount,
      addAccount: createElement('p', null, 'the add form'),
      categories: createElement('p', null, 'the categories'),
      settings: createElement('p', null, 'the settings'),
    })
  );
}

describe('FinanceManage', () => {
  it('folds its three parts under one heading, each closed, its count in its head', () => {
    const html = render();

    expect(html).toContain('<h2 id="finance-manage-title" class="subhead">Manage</h2>');
    expect(html.match(/<details /g)).toHaveLength(3);
    expect(html).not.toContain(' open=""');
    expect(html).toContain('<span class="eyebrow">Add an account</span><span class="caption">20 accounts</span>');
    expect(html).toContain('<span class="eyebrow">Categories</span><span class="caption">90 categories</span>');
    expect(html).toContain('<span class="eyebrow">Settings</span>');
    // Folded, the parts are still on the page: a form opened by hand keeps its state.
    expect(html).toContain('the add form');
  });

  it('links to the run log, which is a page of its own and not a fold', () => {
    const html = render();

    expect(html).toMatch(/<a [^>]*href="\/manage\/runs"[^>]*>Run log<\/a>/);
    expect(html.match(/<details /g)).toHaveLength(3);
  });

  it('opens adding an account while there is none, and the categories while there are none', () => {
    expect(render({ accountCount: 0 })).toMatch(/<details id="card-finance-add-account" class="card finance-manage-part" open="">/);
    expect(render({ accountCount: 0 })).toMatch(/<details id="card-finance-categories" class="card finance-manage-part">/);
    expect(render({ categoryCount: 0 })).toMatch(/<details id="card-finance-categories" class="card finance-manage-part" open="">/);
    expect(render({ accountCount: 0, categoryCount: 0 })).toMatch(/<details id="card-finance-settings" class="card finance-manage-part">/);
  });
});
