import { NextResponse } from 'next/server';

import { logHabitValue } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * One habit's absolute value for one day (#37): a check flips, a counter
 * goes +1/-1 -- the client computes the next absolute value and sends it,
 * rather than a delta, so a retried request can never apply twice.
 *
 * @param {Request} request
 */
export async function PUT(request) {
  const body = await request.json().catch(() => null);
  const date = typeof body?.date === 'string' ? body.date : '';
  const habitId = typeof body?.habitId === 'string' ? body.habitId : '';
  const value = body?.value;

  try {
    await logHabitValue({ date, habitId, value });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[habits] could not log ' + habitId + ' for ' + date + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
