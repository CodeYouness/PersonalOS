import { NextResponse } from 'next/server';

import { isDayKey } from '@/lib/domain/dates.js';
import { DAY_READINGS, isDayReading } from '@/lib/domain/day-readings.js';
import { getDailyLog, setDayEnergy, setDayMood } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * The day's saved mood and energy -- what a card re-reads after a failed
 * save, so it never keeps showing a value that was not stored. Every day key
 * addresses a day; an unlogged day is an empty one, both null.
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
  return NextResponse.json({ ok: true, mood: log.mood, energy: log.energy });
}

/**
 * Give a day its mood, its energy or both, or clear either (#243, ADR 0035,
 * ADR 0037). The day is the address; the body is `{ mood }`, `{ energy }` or
 * both, each a whole number on the scale or null, and nothing else -- the old
 * `{ rating }` included. The store refuses a future day and a value off the
 * scale; this route checks the request's shape, and checks both values with
 * the store's own rule before writing either, so a body with one good value
 * and one bad one writes nothing.
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
  const keys = typeof body === 'object' && body !== null && !Array.isArray(body) ? Object.keys(body) : [];
  if (keys.length === 0 || keys.some((key) => !(/** @type {readonly string[]} */ (DAY_READINGS)).includes(key))) {
    return NextResponse.json({ status: 'error', message: 'expected { mood } and/or { energy }' }, { status: 400 });
  }
  const invalid = keys.find((key) => !isDayReading(body[key]));
  if (invalid !== undefined) {
    return NextResponse.json(
      { status: 'error', message: invalid + ' must be a whole number on the scale or null, received ' + JSON.stringify(body[invalid]) },
      { status: 400 }
    );
  }

  try {
    let log = await getDailyLog(date);
    if ('mood' in body) log = await setDayMood({ date, mood: body.mood });
    if ('energy' in body) log = await setDayEnergy({ date, energy: body.energy });
    return NextResponse.json({ ok: true, mood: log.mood, energy: log.energy });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[days] could not save the mood or energy of ' + date + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
