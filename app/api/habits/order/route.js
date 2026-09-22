import { NextResponse } from 'next/server';

import { reorderHabits } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * The whole order at once (#38), never a "move this one up" -- the client
 * sends the full list of ids it now believes in, and the store rejects
 * anything that is not an exact permutation of what it holds, so a reorder
 * can neither drop a habit nor invent one.
 *
 * A stale order over the *same* habits is still a valid permutation and is
 * accepted here; keeping the client from building one is the screen's job.
 * See ADR 0016.
 *
 * @param {Request} request
 */
export async function PUT(request) {
  const body = await request.json().catch(() => null);

  try {
    const habits = await reorderHabits(body?.ids);
    return NextResponse.json({ ok: true, habits });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[habits] could not reorder habits:', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
