import { NextResponse } from 'next/server';

import { deleteTransaction, getTransaction, updateTransaction } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * What correcting a movement changes (#134): any of its own fields. Never
 * its origin -- where it came from is not a correction.
 */
const EDITABLE = ['date', 'amount', 'accountId', 'counterAccountId', 'categoryId', 'description', 'note', 'tags', 'notCounted'];

/**
 * Correct a movement in place. Choosing a counter account turns it into a
 * transfer and clears its category; the store refuses what it refuses on
 * the way in (ADR 0023).
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
  if ((await getTransaction(id)) === null) {
    return NextResponse.json({ status: 'error', message: 'no transaction with id ' + id }, { status: 404 });
  }

  try {
    return NextResponse.json({ ok: true, transaction: await updateTransaction(id, body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[transactions] could not update ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}

/**
 * Delete a movement recorded by mistake, after the panel has asked. Its
 * links go with it; a capture that produced it keeps its sentence.
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
    await deleteTransaction(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[transactions] could not delete ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
