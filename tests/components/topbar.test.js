/**
 * The top bar (ADR 0049): the brand is the way Home, as is customary --
 * "PersonalOS" links to `/`, named for a screen reader, and is the current
 * page there -- and Home is not a nav item.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ refresh() {} }) }));

const { default: Topbar } = await import('@/components/Topbar.js');

function render() {
  return renderToStaticMarkup(createElement(Topbar));
}

describe('Topbar', () => {
  beforeEach(() => {
    pathname = '/';
  });

  it('links the brand to Home, named "PersonalOS, home", the current page on Home', () => {
    const html = render();

    expect(html).toMatch(/<a class="brand" aria-label="PersonalOS, home" aria-current="page" href="\/">/);
    expect(html).toContain('<span class="brand-name">PersonalOS</span></a>');
  });

  it('is not the current page elsewhere, where that screen\'s item is', () => {
    pathname = '/finances';
    const html = render();

    expect(html).toMatch(/<a class="brand" aria-label="PersonalOS, home" href="\/">/);
    expect(html).toContain('<a class="nav-item" aria-current="page" href="/finances">Finances</a>');
  });

  it('lists the screens without Home, in their order', () => {
    const items = [...render().matchAll(/class="nav-item"[^>]*>([^<]+)</g)].map((match) => match[1]);

    expect(items).toEqual(['CRM', 'Goals', 'Habits', 'Journal', 'Nutrition &amp; Health', 'Finances', 'Review']);
  });
});
