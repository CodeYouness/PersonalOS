import { describe, expect, it, vi } from 'vitest';

import { submitCapture } from '@/components/captureBarSubmit.js';

/**
 * @param {number} status
 * @param {object} body
 */
function fakeResponse(status, body) {
  return { ok: status >= 200 && status < 300, json: () => Promise.resolve(body) };
}

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
