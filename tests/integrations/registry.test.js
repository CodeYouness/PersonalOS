/**
 * The registry itself stays untested elsewhere because it was empty --
 * ticket #31 is the first concrete integration, so this is that coverage.
 */

import { describe, expect, it } from 'vitest';

import { findIntegration } from '@/lib/integrations/registry.js';

describe('integration registry', () => {
  it('lists the calendar integration, unconfigured with no iCal URL set', () => {
    const integration = findIntegration('google-calendar');

    expect(integration).not.toBeNull();
    expect(integration?.kind).toBe('calendar');
    // The test environment never sets GOOGLE_CALENDAR_ICAL_URL.
    expect(integration?.isConfigured()).toBe(false);
  });

  it('reports an unknown integration as absent rather than throwing', () => {
    expect(findIntegration('not-a-real-integration')).toBeNull();
  });
});
