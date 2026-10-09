import { NextResponse } from 'next/server';

import { createAccount } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * Add an account (#114) from the Finances screen: a name and a kind. The
 * store refuses a blank name, a kind outside ACCOUNT_KINDS and any currency
 * but EUR; nothing else is taken from the body. It has no value until a
 * balance is recorded -- unknown, never zero.
 *
 * @param {Request} request
 */
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ status: 'error', message: 'expected a JSON object' }, { status: 400 });
  }

  try {
    const account = await createAccount({ name: body.name, kind: body.kind, currency: body.currency, source: 'user' });
    return NextResponse.json({ ok: true, account });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[accounts] could not add an account:', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
