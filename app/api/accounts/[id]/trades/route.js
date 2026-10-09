import { NextResponse } from 'next/server';

import { createTrade, getAccount } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** What a trade is recorded with. The account is the one in the address. */
const FIELDS = ['date', 'direction', 'units', 'price', 'fee', 'currency'];

/**
 * Record a buy or a sell on a holding (#116): its date, units (an integer
 * count of 10^-8 units), price per unit and fee (cents). The store refuses a
 * trade on an account valued by balance, a sell that would take the units
 * held below zero on any day, and any currency but EUR.
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
    const trade = await createTrade({ ...body, accountId: id, source: 'user' });
    return NextResponse.json({ ok: true, trade });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[accounts] could not record a trade on ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
