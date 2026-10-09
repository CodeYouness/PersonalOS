import { NextResponse } from 'next/server';

import { deleteAccount, getAccount, updateAccount } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * What the account panel changes (#115): its name, and whether it is
 * archived -- a request the store turns into the day it was archived on --
 * and how it is valued, which the store refuses once it has data (#116).
 */
const EDITABLE = ['name', 'archived', 'valuation'];

/**
 * Rename or archive an account. An archived account leaves the table and
 * today's net worth, keeps its balances, and still counts on every earlier
 * day it had a value. The store validates each value.
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
  if ((await getAccount(id)) === null) {
    return NextResponse.json({ status: 'error', message: 'no account with id ' + id }, { status: 404 });
  }

  try {
    return NextResponse.json({ ok: true, account: await updateAccount(id, body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[accounts] could not update account ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}

/**
 * Delete an account created by mistake (#115), after the panel has asked:
 * its balances and every link go with it. The store refuses one that
 * transactions belong to -- that one is archived instead.
 *
 * @param {Request} _request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function DELETE(_request, { params }) {
  const { id } = await params;
  if ((await getAccount(id)) === null) {
    return NextResponse.json({ status: 'error', message: 'no account with id ' + id }, { status: 404 });
  }

  try {
    await deleteAccount(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[accounts] could not delete account ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
