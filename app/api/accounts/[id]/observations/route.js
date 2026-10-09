import { NextResponse } from 'next/server';

import { today } from '@/lib/domain/dates.js';
import { getAccount, recordObservation } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** What a balance is recorded with. The account is the one in the address. */
const FIELDS = ['amount', 'date', 'currency'];

/**
 * Record a balance (#114): an amount in minor units on a date, today when
 * none is given -- a past date is allowed, for the value forgotten last
 * month. The store refuses a fraction of a cent, a negative liability (the
 * positive amount owed is what is recorded) and any currency but EUR.
 *
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ status: 'error', message: 'expected a JSON object' }, { status: 400 });
  }
  const unknown = Object.keys(body).filter((key) => !FIELDS.includes(key));
  if (unknown.length > 0) {
    const message = 'not recorded here: ' + unknown.join(', ');
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
  if ((await getAccount(id)) === null) {
    return NextResponse.json({ status: 'error', message: 'no account with id ' + id }, { status: 404 });
  }

  try {
    const observation = await recordObservation({
      accountId: id,
      kind: 'balance',
      amount: body.amount,
      date: body.date ?? today(),
      currency: body.currency,
      source: 'user',
    });
    return NextResponse.json({ ok: true, observation });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[accounts] could not record a balance on ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
