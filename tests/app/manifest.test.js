/** The web app manifest: what makes "Add to Dock" open PersonalOS as its own window. */
import { describe, expect, it } from 'vitest';

import manifest from '@/app/manifest.js';

describe('web app manifest', () => {
  const m = manifest();

  it('names the product and opens standalone at the root', () => {
    expect(m.name).toBe('PersonalOS');
    expect(m.short_name).toBe('PersonalOS');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
  });

  it('carries the theme colours as hex', () => {
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('points at the existing icon', () => {
    expect(m.icons?.map((i) => i.src)).toContain('/icon.svg');
  });
});
