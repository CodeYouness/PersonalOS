import { NextResponse } from 'next/server';

import { isDayKey } from '@/lib/domain/dates.js';
import { getDailyLog, setDayRating } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * The day's saved rating -- what a card re-reads after a failed save, so it
 * never keeps showing a rating that was not stored. Every day key addresses a
 * day; an unlogged day is an empty one, rating null.
 *
 * @param {Request} _request
 * @param {{ params: Promise<{ date: string }> }} context
 */
export async function GET(_request, { params }) {
  const { date } = await params;
  if (!isDayKey(date)) {
    return NextResponse.json({ status: 'error', message: 'date must be a day, YYYY-MM-DD' }, { status: 400 });
  }
  const log = await getDailyLog(date);
  return NextResponse.json({ ok: true, rating: log.rating });
}

/**
 * Rate a day, or clear its rating (#243, ADR 0035). The day is the address;
 * the body is `{ rating }`, a whole number on the scale or null. The store
 * refuses a future day and a value off the scale; this route checks only the
 * request's shape.
 *
 * @param {Request} request
 * @param {{ params: Promise<{ date: string }> }} context
 */
export async function PUT(request, { params }) {
  const { date } = await params;
  if (!isDayKey(date)) {
    return NextResponse.json({ status: 'error', message: 'date must be a day, YYYY-MM-DD' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null || Array.isArray(body) || !('rating' in body)) {
    return NextResponse.json({ status: 'error', message: 'expected { rating }' }, { status: 400 });
  }

  try {
    const log = await setDayRating({ date, rating: body.rating });
    return NextResponse.json({ ok: true, rating: log.rating });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[days] could not rate ' + date + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
