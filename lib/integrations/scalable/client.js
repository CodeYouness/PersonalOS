/**
 * Talking to `sc`, Scalable's own CLI (ADR 0010, ADR 0031) -- the layer that
 * knows the command lines and the envelope, and nothing else. It takes a
 * runner, `(args) => Promise<parsed stdout>`, so the core never spawns a
 * process and a test answers each command from an invented payload.
 *
 * Any failure -- a non-zero exit (1, 10, 20 or 30), output that is not an
 * envelope, an envelope with `ok: false` -- throws, and the sync, which reads
 * everything before it writes anything, therefore writes nothing.
 */

/** Rows asked for per page; `sc` allows 1..100. */
const PAGE_SIZE = 100;
/** A runaway cursor must not loop forever. */
const MAX_PAGES = 1000;

/** What a runner throws when `sc` exits non-zero. */
export class ScCommandError extends Error {
  /**
   * @param {number} exitCode `sc`'s exit code: 1 generic, 10 validation, 20 auth/config, 30 network/backend
   * @param {string} message
   */
  constructor(exitCode, message) {
    super(message);
    this.name = 'ScCommandError';
    this.exitCode = exitCode;
  }
}

/**
 * @typedef {(args: string[]) => Promise<unknown>} ScRunner runs one `sc`
 *   command (`--json` is the runner's to add) and resolves its parsed stdout
 */

/**
 * One command; returns the envelope's `data`.
 *
 * @param {ScRunner} run
 * @param {string[]} args
 * @returns {Promise<Record<string, any>>}
 */
export async function callSc(run, args) {
  const label = 'sc ' + args.join(' ');
  const envelope = /** @type {any} */ (await run(args));
  if (typeof envelope !== 'object' || envelope === null || Array.isArray(envelope)) {
    throw new Error(label + ' did not answer with a JSON envelope');
  }
  if (envelope.ok !== true) {
    throw new Error(label + ' failed: ' + String(envelope.error?.message ?? 'no reason given'));
  }
  if (typeof envelope.data !== 'object' || envelope.data === null) {
    throw new Error(label + ' answered without data');
  }
  return envelope.data;
}

/**
 * The `data.result` of a command that has one (everything but the chart).
 *
 * @param {ScRunner} run
 * @param {string[]} args
 * @returns {Promise<Record<string, any>>}
 */
export async function callScResult(run, args) {
  const data = await callSc(run, args);
  if (typeof data.result !== 'object' || data.result === null) {
    throw new Error('sc ' + args.join(' ') + ' answered without a result');
  }
  return data.result;
}

/**
 * @param {ScRunner} run
 * @returns {Promise<{ items: any[], cryptoItems: any[] }>}
 */
export async function fetchHoldings(run) {
  const result = await callScResult(run, ['broker', 'holdings']);
  return { items: listOf(result.items, 'holdings'), cryptoItems: listOf(result.crypto_items ?? [], 'crypto holdings') };
}

/**
 * Every transaction row, paged to the end. `count` and `total` are per page,
 * so only the cursor decides when to stop. Crypto has its own stream, which
 * is out of scope and never followed.
 *
 * @param {ScRunner} run
 * @returns {Promise<any[]>} newest first, as `sc` serves them
 */
export async function fetchTransactions(run) {
  /** @type {any[]} */
  const rows = [];
  /** @type {string | null} */
  let cursor = null;
  const seen = new Set();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const args = ['broker', 'transactions', '--page-size', String(PAGE_SIZE)];
    if (cursor !== null) args.push('--cursor', cursor);
    const result = await callScResult(run, args);
    rows.push(...listOf(result.items, 'transactions'));
    cursor = typeof result.cursor === 'string' && result.cursor !== '' ? result.cursor : null;
    if (cursor === null) return rows;
    if (seen.has(cursor)) throw new Error('sc broker transactions repeated a cursor; stopping');
    seen.add(cursor);
  }
  throw new Error('sc broker transactions did not end after ' + MAX_PAGES + ' pages');
}

/**
 * The `security_trade` object of one order's details: where the fee lives.
 *
 * @param {ScRunner} run
 * @param {string} id
 * @returns {Promise<Record<string, any>>}
 */
export async function fetchTradeDetails(run, id) {
  const result = await callScResult(run, ['broker', 'transaction', 'details', '--transaction-id', id]);
  const trade = result.security_trade;
  if (typeof trade !== 'object' || trade === null) throw new Error('the details of ' + id + ' are not a security trade');
  return trade;
}

/**
 * @param {unknown} value
 * @param {string} what
 * @returns {any[]}
 */
function listOf(value, what) {
  if (!Array.isArray(value)) throw new Error('sc answered with ' + what + ' that are not a list');
  return value;
}
