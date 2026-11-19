import { NextResponse } from 'next/server';

import { getTransaction, pairRefund, unpairRefund } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * Which purchase a refund gives money back for (ADR 0055): `{ purchaseId }`
 * pairs this movement, the refund, with that purchase. 404 for an unknown
 * movement, 400 for a body that is not `{ purchaseId: <id> }` and for a pair
 * the store refuses -- money out paired as a refund, a transfer, another
 * currency, a refund dated before its purchase, refunds that would come to
 * more than it cost, a refund already paired with another purchase -- with
 * the store's reason. The same pair twice is one pair.
 *
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function PUT(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ status: 'error', message: 'expected a JSON object' }, { status: 400 });
  }
  const unknown = Object.keys(body).filter((key) => key !== 'purchaseId');
  if (unknown.length > 0) {
    return NextResponse.json({ status: 'error', message: 'not taken here: ' + unknown.join(', ') }, { status: 400 });
  }
  if (typeof body.purchaseId !== 'string') {
    return NextResponse.json({ status: 'error', message: 'purchaseId must be a transaction id' }, { status: 400 });
  }
  if ((await getTransaction(id)) === null) {
    return NextResponse.json({ status: 'error', message: 'no transaction with id ' + id }, { status: 404 });
  }

  try {
    const link = await pairRefund(id, body.purchaseId);
    return NextResponse.json({ ok: true, link });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[transactions] could not pair refund ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}

/**
 * Unpairs a refund from its purchase (ADR 0055): both count and list on
 * their own again. A refund paired with nothing is left as it is. 404 for an
 * unknown movement.
 *
 * @param {Request} _request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function DELETE(_request, { params }) {
  const { id } = await params;
  if ((await getTransaction(id)) === null) {
    return NextResponse.json({ status: 'error', message: 'no transaction with id ' + id }, { status: 404 });
  }

  try {
    await unpairRefund(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[transactions] could not unpair refund ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
