import { NextResponse } from 'next/server';

import { reopenGoal, getGoal } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * Reopen a done goal (#99): back on the card, no event. 404 for an unknown
 * goal, 400 when the store refuses.
 *
 * @param {Request} _request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function POST(_request, { params }) {
  const { id } = await params;
  if ((await getGoal(id)) === null) {
    return NextResponse.json({ status: 'error', message: 'no goal with id ' + id }, { status: 404 });
  }

  try {
    const goal = await reopenGoal(id);
    return NextResponse.json({ ok: true, goal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[goals] could not reopen goal ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
