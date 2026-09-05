import { describe, expect, it } from 'vitest';

import { captureBarReducer, INITIAL_STATE } from '@/components/captureBarReducer.js';

describe('captureBarReducer', () => {
  it('starts idle', () => {
    expect(INITIAL_STATE).toEqual({ status: 'idle', text: '', receipt: null, error: null });
  });

  it('moves to processing on submit, keeping the text', () => {
    const state = captureBarReducer(INITIAL_STATE, { type: 'submit', text: 'Call the accountant' });

    expect(state).toEqual({ status: 'processing', text: 'Call the accountant', receipt: null, error: null });
  });

  it('ignores a second submit while already processing', () => {
    const processing = captureBarReducer(INITIAL_STATE, { type: 'submit', text: 'First' });
    const state = captureBarReducer(processing, { type: 'submit', text: 'Second' });

    expect(state).toBe(processing);
  });

  it('moves to done with the receipt when the request succeeds', () => {
    const processing = captureBarReducer(INITIAL_STATE, { type: 'submit', text: 'Call the accountant' });
    const state = captureBarReducer(processing, {
      type: 'receiptReceived',
      receipt: { destination: 'task', route: 'rules' },
    });

    expect(state).toEqual({
      status: 'done',
      text: 'Call the accountant',
      receipt: { destination: 'task', route: 'rules' },
      error: null,
    });
  });

  it('moves to error, keeping the text so nothing typed is lost', () => {
    const processing = captureBarReducer(INITIAL_STATE, { type: 'submit', text: 'Call the accountant' });
    const state = captureBarReducer(processing, { type: 'requestFailed', error: 'Could not reach the server' });

    expect(state).toEqual({
      status: 'error',
      text: 'Call the accountant',
      receipt: null,
      error: 'Could not reach the server',
    });
  });

  it('returns to idle from done on dismiss', () => {
    const done = captureBarReducer(INITIAL_STATE, {
      type: 'receiptReceived',
      receipt: { destination: 'task', route: 'rules' },
    });

    expect(captureBarReducer(done, { type: 'dismiss' })).toEqual(INITIAL_STATE);
  });

  it('returns to idle from error on dismiss', () => {
    const error = captureBarReducer(INITIAL_STATE, { type: 'requestFailed', error: 'oops' });

    expect(captureBarReducer(error, { type: 'dismiss' })).toEqual(INITIAL_STATE);
  });
});
