import { NextResponse } from 'next/server';

import { deleteObservation, getObservations, updateObservation } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** What correcting a balance changes (#115). Never its account. */
const EDITABLE = ['amount', 'date'];

/** @param {string} id */
async function exists(id) {
  return (await getObservations({})).some((observation) => observation.id === id);
}

/**
 * Correct a balance you mistyped: its amount, its date, or both. The
 * history follows, because it is derived from the balances (#118). The
 * store refuses a debt corrected to a negative amount.
 *
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ status: 'error', message: 'expected a JSON object' }, { status: 400 });
  }
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ status: 'error', message: 'nothing to change' }, { status: 400 });
  }
  const unknown = Object.keys(body).filter((key) => !EDITABLE.includes(key));
  if (unknown.length > 0) {
    const message = 'not editable here: ' + unknown.join(', ');
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
  if (!(await exists(id))) {
    return NextResponse.json({ status: 'error', message: 'no balance with id ' + id }, { status: 404 });
  }

  try {
    return NextResponse.json({ ok: true, observation: await updateObservation(id, body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[observations] could not update ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}

/**
 * Delete a balance entered by mistake. With no other balance, the account
 * is unknown again -- never zero.
 *
 * @param {Request} _request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function DELETE(_request, { params }) {
  const { id } = await params;
  if (!(await exists(id))) {
    return NextResponse.json({ status: 'error', message: 'no balance with id ' + id }, { status: 404 });
  }

  try {
    await deleteObservation(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[observations] could not delete ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
