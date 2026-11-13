import { NextResponse } from 'next/server';

import { setHabitSkip } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** The fields a PUT names, every one of them. */
const FIELDS = ['date', 'habitId', 'reason'];

/**
 * Why one habit's scheduled day was not kept (ADR 0037): a skip reason, or
 * null to clear it. Beside `PUT /api/habits/log` rather than inside it: a
 * value and a reason are two writes with their own refusals, and a body that
 * named both would ask the store to keep a reason beside a day it is about
 * to complete.
 *
 * The body is `{ date, habitId, reason }` and nothing else. The store refuses
 * a future day, an unknown habit or reason, a day the habit was not
 * scheduled and a day it was kept; this route checks the request's shape and
 * maps the refusal to a 400. It answers with the day's reasons as saved, so
 * the screen shows what was stored.
 *
 * @param {Request} request
 */
export async function PUT(request) {
  const body = await request.json().catch(() => null);
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ status: 'error', message: 'the body must be a JSON object' }, { status: 400 });
  }
  const unknown = Object.keys(body).filter((key) => !FIELDS.includes(key));
  if (unknown.length > 0) {
    return NextResponse.json(
      { status: 'error', message: 'the body names only ' + FIELDS.join(', ') + ', received ' + unknown.join(', ') },
      { status: 400 }
    );
  }
  if (!('reason' in body)) {
    return NextResponse.json({ status: 'error', message: 'reason is required: a reason, or null to clear it' }, { status: 400 });
  }
  const date = typeof body.date === 'string' ? body.date : '';
  const habitId = typeof body.habitId === 'string' ? body.habitId : '';

  try {
    const log = await setHabitSkip({ date, habitId, reason: body.reason });
    return NextResponse.json({ ok: true, skips: log.skips });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[habits] could not set the skip reason of ' + habitId + ' for ' + date + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
