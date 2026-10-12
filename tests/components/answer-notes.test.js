import { describe, expect, it } from 'vitest';

import { readSummarised, summarisedNote, TOO_LARGE_TEXT } from '@/components/answerNotes.js';

describe('readSummarised', () => {
  it('reads the month the route said transactions are listed in full from', () => {
    expect(readSummarised({ before: '2026-06' })).toEqual({ before: '2026-06' });
  });

  it('reads nothing as null', () => {
    expect(readSummarised(null)).toBeNull();
    expect(readSummarised(undefined)).toBeNull();
  });

  it.each([
    ['a string', '2026-06'],
    ['an array', ['2026-06']],
    ['a number', 6],
    ['no before', {}],
    ['a before that is not a string', { before: 202606 }],
    ['a before that is not a month', { before: 'June 2026' }],
    ['a before with a day', { before: '2026-06-01' }],
    ['a month 13', { before: '2026-13' }],
    ['a month 00', { before: '2026-00' }],
  ])('ignores %s: it is never rendered', (_name, value) => {
    expect(readSummarised(value)).toBeNull();
  });

  it('keeps only before, whatever else came with it', () => {
    expect(readSummarised({ before: '2026-06', extra: '<b>x</b>' })).toEqual({ before: '2026-06' });
  });

  it('reads since too, when the route said older months were left whole', () => {
    expect(readSummarised({ since: '2026-03', before: '2026-06' })).toEqual({ since: '2026-03', before: '2026-06' });
  });

  it('ignores a since that is not a month, never rendering it', () => {
    expect(readSummarised({ since: 'March', before: '2026-06' })).toEqual({ before: '2026-06' });
    expect(readSummarised({ since: 3, before: '2026-06' })).toEqual({ before: '2026-06' });
  });

  it('ignores a since that is not older than before: the range would be empty', () => {
    expect(readSummarised({ since: '2026-06', before: '2026-06' })).toEqual({ before: '2026-06' });
    expect(readSummarised({ since: '2026-07', before: '2026-06' })).toEqual({ before: '2026-06' });
  });
});

describe('summarisedNote', () => {
  it('names the month in the shared month-label format', () => {
    expect(summarisedNote({ before: '2026-06' })).toBe('Transactions before June 2026 were read as monthly totals.');
    expect(summarisedNote({ before: '2026-03' })).toBe('Transactions before March 2026 were read as monthly totals.');
  });

  it('names the range when older months were left whole: it never claims what it did not summarise', () => {
    expect(summarisedNote({ since: '2026-03', before: '2026-06' })).toBe(
      'Transactions from March 2026 to May 2026 were read as monthly totals.'
    );
  });

  it('names a single month once', () => {
    expect(summarisedNote({ since: '2026-03', before: '2026-04' })).toBe(
      'Transactions of March 2026 were read as monthly totals.'
    );
  });

  it('is null when nothing was summarised', () => {
    expect(summarisedNote(null)).toBeNull();
  });
});

describe('TOO_LARGE_TEXT', () => {
  it('says nothing was sent, as the mockup does', () => {
    expect(TOO_LARGE_TEXT).toBe('Too much data to ask over, even summarised. Nothing was sent.');
  });
});
