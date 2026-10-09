import { NextResponse } from 'next/server';

import { getAccount, recordPrice } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** What a price is recorded with. The holding is the one in the address. */
const FIELDS = ['date', 'price', 'currency'];

/**
 * Record what one unit of a holding was worth on a date (#117), for a month
 * with no trade to say so. One per holding per day: a second for the same
 * day corrects it. The store refuses a price on an account valued by
 * balance and any currency but EUR.
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
    const price = await recordPrice({ ...body, accountId: id, source: 'user' });
    return NextResponse.json({ ok: true, price });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[accounts] could not record a price on ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
