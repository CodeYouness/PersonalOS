import { describe, expect, it } from 'vitest';

import { provenanceLabel } from '@/components/format.js';

describe('provenanceLabel', () => {
  it('names the capture and who filed it', () => {
    expect(provenanceLabel({ createdDayKey: '2026-01-04', source: 'capture', route: 'model' }, '2026-01-05')).toBe(
      'Created 4 Jan from a capture · filed by the model'
    );
    expect(provenanceLabel({ createdDayKey: '2026-01-04', source: 'capture', route: 'rules' }, '2026-01-05')).toBe(
      'Created 4 Jan from a capture · filed by rules'
    );
  });

  it('says a task you made yourself was made by you', () => {
    expect(provenanceLabel({ createdDayKey: '2026-01-04', source: 'user', route: null }, '2026-01-05')).toBe(
      'Created 4 Jan by you'
    );
  });

  it('adds the year once the day is not in this one', () => {
    expect(provenanceLabel({ createdDayKey: '2025-12-30', source: 'user', route: null }, '2026-01-05')).toBe(
      'Created 30 Dec 2025 by you'
    );
  });
});
