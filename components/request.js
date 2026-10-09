/**
 * One write from a panel to its route, shared by every panel that refreshes
 * the real state after it -- the Goals panel and the Finances panel.
 */

/**
 * One write. Resolves to the server's JSON answer; throws with the server's
 * own message when it refuses, or a plain one when it cannot be reached.
 *
 * @param {string} url
 * @param {RequestInit} init
 * @returns {Promise<any>}
 */
export async function request(url, init) {
  let response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error('Could not reach the server');
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message ?? 'Something went wrong');
  return payload;
}

/** @param {unknown} caught */
export function messageOf(caught) {
  return caught instanceof Error ? caught.message : 'Something went wrong';
}
