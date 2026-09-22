import { NextResponse } from 'next/server';

import { updateHabit } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * Rename a habit, change a counter's target, or archive and restore it
 * (#38). `type` is not among the fields the store accepts here and a patch
 * naming it is rejected, not ignored -- see HABIT_PATCH_FIELDS.
 *
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  try {
    const habit = await updateHabit(id, body ?? {});
    return NextResponse.json({ ok: true, habit });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[habits] could not update habit ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
