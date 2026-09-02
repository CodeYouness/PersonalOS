import { describe, expect, it } from 'vitest';

import { isRef, parseRef, refType, requireRef, requireRefOfType } from '@/lib/domain/refs.js';

describe('references', () => {
  it('reads the entity type out of the id itself', () => {
    // This is what lets a reference be a plain string everywhere instead of
    // a {type, id} pair every caller has to assemble.
    expect(refType('task_9f2c')).toBe('task');
    expect(refType('person_' + crypto.randomUUID())).toBe('person');
    expect(parseRef('goal_seed_1')).toEqual({ type: 'goal', key: 'seed_1' });
  });

  it('rejects a type nobody declared', () => {
    // ENTITY_TYPES is the registry. A prefix outside it would create a link
    // pointing at a kind of thing that does not exist.
    expect(isRef('sandwich_1')).toBe(false);
    expect(refType('sandwich_1')).toBeNull();
  });

  it('rejects anything that is not shaped like a reference', () => {
    expect(isRef('task')).toBe(false);
    expect(isRef('task_')).toBe(false);
    expect(isRef('_1')).toBe(false);
    expect(isRef(42)).toBe(false);
    expect(isRef(null)).toBe(false);
  });

  it('throws with the field name when required', () => {
    expect(() => requireRef('nope', 'from')).toThrow(/from/);
    expect(requireRef('task_1', 'from')).toBe('task_1');
  });

  it('constrains a reference to the kinds a relation allows', () => {
    expect(requireRefOfType('account_1', 'accountId', ['account'])).toBe('account_1');
    expect(() => requireRefOfType('task_1', 'accountId', ['account'])).toThrow(/account/);
  });
});
