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

describe('what was read of the archive (ADR 0070)', () => {
  const READ = { parts: ['life', 'money'], months: { from: '2026-09', to: '2026-11' } };

  it('is said in one line, parts then months', async () => {
    const { readNote } = await import('@/components/answerNotes.js');
    expect(readNote(READ)).toBe('Read only: tasks and days, accounts and monthly totals. Months: September 2026 to November 2026.');
    expect(readNote({ parts: ['transactions'], months: { from: '2026-10', to: '2026-10' } })).toBe('Read only: single movements. Months: October 2026.');
  });

  it('is nothing when the whole archive was read', async () => {
    const { readNote } = await import('@/components/answerNotes.js');
    expect(readNote(null)).toBeNull();
    expect(readNote(undefined)).toBeNull();
  });

  it('is trusted from a response only in the shape the route sends', async () => {
    const { readRead } = await import('@/components/answerNotes.js');
    expect(readRead(READ)).toEqual(READ);
    for (const bad of [null, 'life', [], { parts: [] }, { parts: ['everything'], months: READ.months }, { parts: ['life'] }, { parts: ['life'], months: { from: '2026-11', to: '2026-09' } }, { parts: ['life'], months: { from: 'x', to: 'y' } }]) {
      expect(readRead(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
