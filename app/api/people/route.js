import { NextResponse } from 'next/server';

import { createPerson } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * Add a person by name (#55) -- the CRM panel's "Add '<name>'". Only the
 * user ever creates a person; a capture only links one that exists (ADR
 * 0018). The name is all it gets: organization, kind and note stay empty
 * rather than guessed. 400 on a blank or missing name.
 *
 * @param {Request} request
 */
export async function POST(request) {
  const body = await request.json().catch(() => null);

  try {
    // The store refuses a missing or blank name; nothing else is taken from
    // the body.
    const person = await createPerson({ name: body?.name, source: 'user' });
    return NextResponse.json({ ok: true, person });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[people] could not add a person:', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
