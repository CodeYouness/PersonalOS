import { NextResponse } from 'next/server';

import { deleteTrade, getTrades, updateTrade } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** What correcting a trade changes (#117). Never its holding. */
const EDITABLE = ['date', 'direction', 'units', 'price', 'fee'];

/** @param {string} id */
async function exists(id) {
  return (await getTrades()).some((row) => row.id === id);
}

/**
 * Correct a trade you mistyped (#117): any of its date, direction, units,
 * price and fee. The store refuses a change that would leave the holding
 * with fewer than zero units on any day -- a smaller or later buy can strand
 * a sell that depended on it.
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
    return NextResponse.json({ status: 'error', message: 'no trade with id ' + id }, { status: 404 });
  }

  try {
    return NextResponse.json({ ok: true, trade: await updateTrade(id, body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[trades] could not update ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}

/**
 * Delete a trade entered by mistake (#117). Refused while a later sell
 * depends on it: the holding would have sold units it never had.
 *
 * @param {Request} _request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function DELETE(_request, { params }) {
  const { id } = await params;
  if (!(await exists(id))) {
    return NextResponse.json({ status: 'error', message: 'no trade with id ' + id }, { status: 404 });
  }

  try {
    await deleteTrade(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[trades] could not delete ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
