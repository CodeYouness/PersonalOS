import { describe, expect, it } from 'vitest';

import { applyAskGesture, captureBarReducer, INITIAL_STATE } from '@/components/captureBarReducer.js';

describe('captureBarReducer', () => {
  it('starts idle', () => {
    expect(INITIAL_STATE).toEqual({ status: 'idle', text: '', receipt: null, error: null, mode: 'capture', answer: null });
  });

  it('moves to processing on submit, keeping the text', () => {
    const state = captureBarReducer(INITIAL_STATE, { type: 'submit', text: 'Call the accountant' });

    expect(state).toEqual({ status: 'processing', text: 'Call the accountant', receipt: null, error: null, mode: 'capture', answer: null });
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
      mode: 'capture',
      answer: null,
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
      mode: 'capture',
      answer: null,
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

  it('leaves an open answer alone when a receipt is dismissed', () => {
    const answered = captureBarReducer(askingState('How much did I spend?'), {
      type: 'answerReceived',
      result: { outcome: 'not-in-data' },
    });
    const done = captureBarReducer(answered, {
      type: 'receiptReceived',
      receipt: { destination: 'task', route: 'rules' },
    });

    expect(captureBarReducer(done, { type: 'dismiss' }).answer).toEqual(answered.answer);
  });

  it('does not dismiss while a question is in flight', () => {
    const asking = askingState('How much did I spend?');

    expect(captureBarReducer(asking, { type: 'dismiss' })).toBe(asking);
  });
});

/** @param {string} question */
function askingState(question) {
  const asking = captureBarReducer(INITIAL_STATE, { type: 'toggleAsk' });
  return captureBarReducer(asking, { type: 'submitQuestion', question });
}

describe('captureBarReducer, Ask mode', () => {
  it('turns Ask on and off with the toggle', () => {
    const on = captureBarReducer(INITIAL_STATE, { type: 'toggleAsk' });
    expect(on.mode).toBe('ask');

    expect(captureBarReducer(on, { type: 'toggleAsk' }).mode).toBe('capture');
  });

  it('ignores the toggle while a question is in flight', () => {
    const asking = askingState('What is on my plate?');

    expect(captureBarReducer(asking, { type: 'toggleAsk' })).toBe(asking);
  });

  it('turns Ask on from the leading-? gesture', () => {
    const on = captureBarReducer(INITIAL_STATE, { type: 'enableAsk' });

    expect(on.mode).toBe('ask');
    expect(captureBarReducer(on, { type: 'enableAsk' })).toBe(on);
  });

  it('moves to asking on submitQuestion, remembering the trimmed question', () => {
    const on = captureBarReducer(INITIAL_STATE, { type: 'toggleAsk' });
    const state = captureBarReducer(on, { type: 'submitQuestion', question: '  What is on my plate?  ' });

    expect(state).toEqual({
      status: 'asking',
      text: 'What is on my plate?',
      receipt: null,
      error: null,
      mode: 'ask',
      answer: null,
    });
  });

  it('refuses an empty or whitespace-only question without changing state', () => {
    const on = captureBarReducer(INITIAL_STATE, { type: 'toggleAsk' });

    expect(captureBarReducer(on, { type: 'submitQuestion', question: '' })).toBe(on);
    expect(captureBarReducer(on, { type: 'submitQuestion', question: '   \n ' })).toBe(on);
  });

  it('ignores a second question while one is in flight', () => {
    const asking = askingState('First?');

    expect(captureBarReducer(asking, { type: 'submitQuestion', question: 'Second?' })).toBe(asking);
  });

  it('ignores a capture submit while a question is in flight', () => {
    const asking = askingState('First?');

    expect(captureBarReducer(asking, { type: 'submit', text: 'Call the accountant' })).toBe(asking);
  });

  it('refuses a question while a capture is being filed', () => {
    const processing = captureBarReducer(INITIAL_STATE, { type: 'submit', text: 'Call the accountant' });
    const state = captureBarReducer(processing, { type: 'submitQuestion', question: 'What?' });

    expect(state).toBe(processing);
  });

  it('stores an answer, goes idle and returns to capture', () => {
    const result = {
      outcome: 'answer',
      statements: [{ text: 'One task is open.', citations: [{ id: 'task_seed_1', type: 'task', label: 'Send the revised quote' }] }],
      leftOut: false,
    };
    const state = captureBarReducer(askingState('What is open?'), { type: 'answerReceived', result });

    expect(state.status).toBe('idle');
    expect(state.mode).toBe('capture');
    expect(state.answer).toEqual({ question: 'What is open?', ...result });
  });

  it.each(['not-in-data', 'no-model'])('stores the %s outcome and returns to capture', (outcome) => {
    const state = captureBarReducer(askingState('What is open?'), { type: 'answerReceived', result: { outcome } });

    expect(state.answer).toEqual({ question: 'What is open?', outcome });
    expect(state.mode).toBe('capture');
    expect(state.status).toBe('idle');
  });

  it('stores a failure with its message, returns to capture, and keeps the question for a retry', () => {
    const state = captureBarReducer(askingState('What is open?'), {
      type: 'questionFailed',
      message: "The model didn't answer.",
    });

    expect(state.answer).toEqual({
      question: 'What is open?',
      outcome: 'failed',
      message: "The model didn't answer.",
    });
    expect(state.mode).toBe('capture');
    expect(state.status).toBe('idle');
  });

  it('remembers that a failure cannot be retried, so the panel does not offer it', () => {
    const state = captureBarReducer(askingState('What is open?'), {
      type: 'questionFailed',
      message: 'question must be at most 1000 characters',
      retryable: false,
    });

    expect(state.answer).toEqual({
      question: 'What is open?',
      outcome: 'failed',
      message: 'question must be at most 1000 characters',
      retryable: false,
    });
    // A retry of it is refused too.
    expect(captureBarReducer(state, { type: 'retryQuestion' })).toBe(state);
  });

  it('retries the same question without retyping it, and clears the failed answer', () => {
    const failed = captureBarReducer(askingState('What is open?'), { type: 'questionFailed', message: 'x' });
    const state = captureBarReducer(failed, { type: 'retryQuestion' });

    expect(state.status).toBe('asking');
    expect(state.text).toBe('What is open?');
    expect(state.mode).toBe('ask');
    expect(state.answer).toBeNull();
  });

  it('only retries a failed answer', () => {
    const answered = captureBarReducer(askingState('What is open?'), {
      type: 'answerReceived',
      result: { outcome: 'not-in-data' },
    });

    expect(captureBarReducer(answered, { type: 'retryQuestion' })).toBe(answered);
    expect(captureBarReducer(INITIAL_STATE, { type: 'retryQuestion' })).toBe(INITIAL_STATE);
  });

  it('closes the answer', () => {
    const answered = captureBarReducer(askingState('What is open?'), {
      type: 'answerReceived',
      result: { outcome: 'not-in-data' },
    });

    expect(captureBarReducer(answered, { type: 'closeAnswer' }).answer).toBeNull();
  });

  it('still shows an answer that arrives after the panel was closed during the wait', () => {
    const asking = askingState('What is open?');
    const closed = captureBarReducer(asking, { type: 'closeAnswer' });
    const state = captureBarReducer(closed, { type: 'answerReceived', result: { outcome: 'not-in-data' } });

    expect(closed.status).toBe('asking');
    expect(state.answer).toEqual({ question: 'What is open?', outcome: 'not-in-data' });
  });

  it('stays closed when the panel is closed after the answer arrived', () => {
    const answered = captureBarReducer(askingState('What is open?'), {
      type: 'answerReceived',
      result: { outcome: 'not-in-data' },
    });

    expect(captureBarReducer(captureBarReducer(answered, { type: 'closeAnswer' }), { type: 'closeAnswer' }).answer).toBeNull();
  });

  it('files a sentence typed with Ask off exactly as before', () => {
    const answered = captureBarReducer(askingState('What is open?'), {
      type: 'answerReceived',
      result: { outcome: 'not-in-data' },
    });
    const state = captureBarReducer(answered, { type: 'submit', text: 'What is open' });

    expect(state.status).toBe('processing');
    expect(state.mode).toBe('capture');
  });
});

describe('applyAskGesture', () => {
  it('turns Ask on and strips a leading ?', () => {
    expect(applyAskGesture('capture', '?')).toEqual({ mode: 'ask', draft: '' });
    expect(applyAskGesture('capture', '?What is open')).toEqual({ mode: 'ask', draft: 'What is open' });
  });

  it('keeps whitespace after the ? out of the question', () => {
    expect(applyAskGesture('capture', '?   What is open')).toEqual({ mode: 'ask', draft: 'What is open' });
  });

  it('treats a ? that is not first as plain text', () => {
    expect(applyAskGesture('capture', 'Is this a question?')).toEqual({ mode: 'capture', draft: 'Is this a question?' });
    expect(applyAskGesture('capture', ' ?x')).toEqual({ mode: 'capture', draft: ' ?x' });
  });

  it('leaves a leading ? alone when Ask is already on', () => {
    expect(applyAskGesture('ask', '?What is open')).toEqual({ mode: 'ask', draft: '?What is open' });
  });

  it('changes nothing for ordinary text', () => {
    expect(applyAskGesture('capture', 'Call the accountant')).toEqual({
      mode: 'capture',
      draft: 'Call the accountant',
    });
  });
});
