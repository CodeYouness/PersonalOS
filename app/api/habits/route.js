import { NextResponse } from 'next/server';

import { createHabit } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * A new habit (#38). The client sends only what it knows -- label, type and,
 * for a counter, a target; the id and the first period are the server's to
 * assign, so a habit can never start on a day the browser guessed.
 *
 * The body is passed through as-is rather than coerced here: the store is
 * the one place that decides what a well-formed habit is, and a second
 * opinion in a route handler is a second one to keep in step.
 *
 * @param {Request} request
 */
export async function POST(request) {
  const body = await request.json().catch(() => null);

  try {
    const habit = await createHabit(body ?? {});
    return NextResponse.json({ ok: true, habit });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[habits] could not create a habit:', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
