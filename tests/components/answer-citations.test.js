import { describe, expect, it } from 'vitest';

import { citationDetailId, citationKey, citationTarget } from '@/components/answerCitations.js';

describe('citationTarget', () => {
  it('is a link when the context gave the citation an address', () => {
    expect(citationTarget({ id: 't1', type: 'task', label: 'Send the quote', opens: '/crm?task=t1' })).toEqual({
      kind: 'link',
      href: '/crm?task=t1',
    });
  });

  it('expands in place, showing its content, when the address is null', () => {
    expect(
      citationTarget({ id: 'p1', type: 'person', label: 'Marta', opens: null, content: 'Marta Oliveira · client' })
    ).toEqual({ kind: 'expand', detail: 'Marta Oliveira · client' });
  });

  it('reads a citation with no opens field as null, not as an error', () => {
    expect(citationTarget({ id: 'p1', type: 'person', label: 'Marta', content: 'Client' })).toEqual({
      kind: 'expand',
      detail: 'Client',
    });
  });

  it('falls back to the label when an expanding citation carries no content', () => {
    expect(citationTarget({ id: 'c1', type: 'capture', label: 'Call Marta', opens: null })).toEqual({
      kind: 'expand',
      detail: 'Call Marta',
    });
  });

  it.each(['https://evil.example/x', '//evil.example/x', 'javascript:alert(1)', '', 'crm?task=1', '/\\evil.example/x', '/\t/evil.example/x', '/\n/evil.example/x', '/ /evil.example', '/\u0000x'])(
    'does not navigate to %j: only a site-relative address is followed',
    (opens) => {
      expect(citationTarget({ id: 'x', type: 'task', label: 'X', opens, content: 'text' }).kind).toBe('expand');
    }
  );
});

describe('citationKey', () => {
  it('keys the expanded state by statement and citation, so one record cited twice expands independently', () => {
    expect(citationKey(0, 'p1')).not.toBe(citationKey(1, 'p1'));
    expect(citationKey(0, 'p1')).not.toBe(citationKey(0, 'p2'));
    expect(citationKey(2, 'p1')).toBe(citationKey(2, 'p1'));
  });
});

describe('citationDetailId', () => {
  it('is one id per expanded chip, and per panel, so aria-controls points at exactly its detail', () => {
    expect(citationDetailId('a', 0, 'p1')).toBe(citationDetailId('a', 0, 'p1'));
    expect(citationDetailId('a', 0, 'p1')).not.toBe(citationDetailId('a', 1, 'p1'));
    expect(citationDetailId('a', 0, 'p1')).not.toBe(citationDetailId('a', 0, 'p2'));
    expect(citationDetailId('a', 0, 'p1')).not.toBe(citationDetailId('b', 0, 'p1'));
  });
});
