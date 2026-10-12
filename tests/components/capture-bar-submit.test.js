import { describe, expect, it, vi } from 'vitest';

import { questionProblem, submitCapture, submitQuestion } from '@/components/captureBarSubmit.js';
import { limits } from '@/personalos.config.js';

/**
 * @param {number} status
 * @param {object} body
 */
function fakeResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

const FAILED_MESSAGE = "The model didn't answer.";

describe('submitCapture', () => {
  it('turns a successful response into a receiptReceived action', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, { destination: 'task', route: 'rules' }));

    const action = await submitCapture('Call the accountant', fetchImpl);

    expect(action).toEqual({ type: 'receiptReceived', receipt: { destination: 'task', route: 'rules' } });
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/capture',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'Call the accountant' }) })
    );
  });

  it('sends a destination chosen up front', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, { destination: 'nutrition', route: 'rules' }));

    await submitCapture('pizza with Marta', fetchImpl, 'nutrition');

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/capture',
      expect.objectContaining({ body: JSON.stringify({ text: 'pizza with Marta', destination: 'nutrition' }) })
    );
  });

  it('turns an error response into a requestFailed action', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(400, { error: 'text is required' }));

    const action = await submitCapture('', fetchImpl);

    expect(action).toEqual({ type: 'requestFailed', error: 'text is required' });
  });

  it('never throws when the network itself fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const action = await submitCapture('Call the accountant', fetchImpl);

    expect(action).toEqual({ type: 'requestFailed', error: 'Could not reach the server' });
  });
});

describe('submitQuestion', () => {
  it('posts only the question, as JSON, to the questions route', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, outcome: 'no-model' }));

    await submitQuestion('What is open?', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/questions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: 'What is open?' }),
      })
    );
  });

  it('turns an answer into an answerReceived action, statements and all', async () => {
    const statements = [
      { text: 'One task is open.', citations: [{ id: 'task_seed_1', type: 'task', label: 'Send the revised quote' }] },
    ];
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fakeResponse(200, { ok: true, outcome: 'answer', statements, leftOut: true }));

    const action = await submitQuestion('What is open?', fetchImpl);

    expect(action).toEqual({ type: 'answerReceived', result: { outcome: 'answer', statements, leftOut: true } });
  });

  it('keeps opens and content on every citation, and does not invent them where the route sent none', async () => {
    const statements = [
      {
        text: 'Marta is a client.',
        citations: [
          { id: 'task_1', type: 'task', label: 'Send the quote', labels: [], opens: '/crm?task=task_1' },
          { id: 'person_1', type: 'person', label: 'Marta', labels: [], opens: null, content: 'Marta Oliveira\nclient' },
          { id: 'old_1', type: 'person', label: 'Older shape' },
        ],
      },
    ];
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, outcome: 'answer', statements }));

    const action = await submitQuestion('Who is Marta?', fetchImpl);

    // Not stripped, not rewritten: a missing `opens` is read as null by the
    // panel (answerCitations), so the helper has nothing to normalise.
    expect(action).toEqual({ type: 'answerReceived', result: { outcome: 'answer', statements, leftOut: false } });
  });

  it.each(['not-in-data', 'no-model'])('turns the %s outcome into an answerReceived action', async (outcome) => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, outcome }));

    expect(await submitQuestion('What is open?', fetchImpl)).toEqual({
      type: 'answerReceived',
      result: { outcome },
    });
  });

  it('turns a 502 into a questionFailed action with the route message', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fakeResponse(502, { status: 'error', outcome: 'failed', message: FAILED_MESSAGE }));

    expect(await submitQuestion('What is open?', fetchImpl)).toEqual({
      type: 'questionFailed',
      message: FAILED_MESSAGE,
    });
  });

  it('turns a 400 into a questionFailed action carrying its message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(400, { status: 'error', message: 'question is required' }));

    // A 400 repeats however often it is sent: the panel must not offer a retry.
    expect(await submitQuestion('', fetchImpl)).toEqual({
      type: 'questionFailed',
      message: 'question is required',
      retryable: false,
    });
  });

  it('gives up on a request that never settles, instead of locking the bar for good', async () => {
    // A fetch that answers nothing until the signal it was given aborts.
    const fetchImpl = vi.fn(
      (/** @type {string} */ _url, /** @type {{ signal: AbortSignal }} */ init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason));
        })
    );

    const action = await submitQuestion('What is open?', /** @type {any} */ (fetchImpl), 20);

    expect(action).toEqual({ type: 'questionFailed', message: 'The model took too long to answer.' });
  });

  it('never throws when the network fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    expect(await submitQuestion('What is open?', fetchImpl)).toEqual({
      type: 'questionFailed',
      message: 'Could not reach the server',
    });
  });

  it('never throws when the body is not JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, json: () => Promise.reject(new SyntaxError('Unexpected token')) });

    expect(await submitQuestion('What is open?', fetchImpl)).toEqual({
      type: 'questionFailed',
      message: FAILED_MESSAGE,
    });
  });

  it('treats an outcome it does not know, or an answer with no statements list, as a failure', async () => {
    const unknown = vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, outcome: 'too-large' }));
    const malformed = vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, outcome: 'answer' }));

    expect((await submitQuestion('What is open?', unknown)).type).toBe('questionFailed');
    expect((await submitQuestion('What is open?', malformed)).type).toBe('questionFailed');
  });

  it('asks and captures through separate routes: never both', async () => {
    const asked = vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, outcome: 'no-model' }));
    const captured = vi.fn().mockResolvedValue(fakeResponse(200, { destination: 'task', route: 'rules' }));

    await submitQuestion('What is open?', asked);
    await submitCapture('Call the accountant', captured);

    expect(asked.mock.calls.map((call) => call[0])).toEqual(['/api/questions']);
    expect(captured.mock.calls.map((call) => call[0])).toEqual(['/api/capture']);
  });
});

describe('questionProblem', () => {
  it('lets a question of exactly the limit through, and nothing else is judged by its content', () => {
    expect(questionProblem('a'.repeat(limits.questionMaxChars))).toBeNull();
    expect(questionProblem('remember to send Marta the revised quote')).toBeNull();
  });

  it('refuses a question over the limit before anything is sent, saying why', () => {
    expect(questionProblem('a'.repeat(limits.questionMaxChars + 1))).toBe(
      'That question is too long: at most ' + limits.questionMaxChars + ' characters.'
    );
  });
});
