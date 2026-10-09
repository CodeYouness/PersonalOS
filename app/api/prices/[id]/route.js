import { NextResponse } from 'next/server';

import { deletePrice, getPrices, updatePrice } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** What correcting a price changes (#117). Never its holding. */
const EDITABLE = ['date', 'price'];

/** @param {string} id */
async function exists(id) {
  return (await getPrices()).some((row) => row.id === id);
}

/**
 * Correct a price you mistyped (#117): its date, its amount, or both. The
 * store refuses moving it onto a day that already has a price.
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
    return NextResponse.json({ status: 'error', message: 'no price with id ' + id }, { status: 404 });
  }

  try {
    return NextResponse.json({ ok: true, price: await updatePrice(id, body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[prices] could not update ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}

/**
 * Delete a price entered by mistake (#117). The holding goes back to the
 * latest price before it -- a trade's or another one typed.
 *
 * @param {Request} _request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function DELETE(_request, { params }) {
  const { id } = await params;
  if (!(await exists(id))) {
    return NextResponse.json({ status: 'error', message: 'no price with id ' + id }, { status: 404 });
  }

  try {
    await deletePrice(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[prices] could not delete ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
