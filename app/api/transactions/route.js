import { NextResponse } from 'next/server';

import { isMonthKey, monthRange } from '@/lib/domain/dates.js';
import { createTransaction, getTransactions } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** What a movement is recorded with (#134). Nothing else is taken from the body. */
const FIELDS = ['date', 'amount', 'accountId', 'counterAccountId', 'categoryId', 'description', 'note', 'tags', 'notCounted'];

/**
 * A month's transactions (#134), newest first: `?month=YYYY-MM`.
 *
 * @param {Request} request
 */
export async function GET(request) {
  const month = new URL(request.url).searchParams.get('month');
  if (!isMonthKey(month)) {
    return NextResponse.json({ status: 'error', message: 'month must be YYYY-MM' }, { status: 400 });
  }
  const { from, to } = monthRange(/** @type {string} */ (month));
  return NextResponse.json({ ok: true, transactions: await getTransactions({ from, to }) });
}

/**
 * Record a movement from the Finances screen's form (#134): signed from its
 * account's side, a transfer when it has a counter account. The store
 * refuses a zero amount, a transfer to itself or to an account that does not
 * exist, a category on a transfer, and a movement on an account archived
 * before its date (ADR 0023).
 *
 * @param {Request} request
 */
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ status: 'error', message: 'expected a JSON object' }, { status: 400 });
  }
  const unknown = Object.keys(body).filter((key) => !FIELDS.includes(key));
  if (unknown.length > 0) {
    const message = 'not recorded here: ' + unknown.join(', ');
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }

  try {
    const transaction = await createTransaction({ ...body, source: 'user' });
    return NextResponse.json({ ok: true, transaction });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[transactions] could not record a movement:', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}

