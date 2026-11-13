import { NextResponse } from 'next/server';

import { isDayKey } from '@/lib/domain/dates.js';
import { DAY_READINGS, isDayReading } from '@/lib/domain/day-readings.js';
import { isTimeArea, isTimeMinutes } from '@/lib/domain/day-time.js';
import { clearDayTime, declareNoTime, getDailyLog, setDayEnergy, setDayMood, setDayTime } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** The fields a PUT may name: the day's two readings and its time. */
const FIELDS = [...DAY_READINGS, 'time'];

/**
 * What the route answers with: the day's readings and its time as saved.
 *
 * @param {import('@/lib/domain/types.js').DailyLog} log
 */
function saved(log) {
  return { ok: true, mood: log.mood, energy: log.energy, time: log.time };
}

/**
 * The day's saved mood, energy and time -- what a card re-reads after a
 * failed save, so it never keeps showing a value that was not stored. Every
 * day key addresses a day; an unlogged day is an empty one, all null.
 *
 * @param {Request} _request
 * @param {{ params: Promise<{ date: string }> }} context
 */
export async function GET(_request, { params }) {
  const { date } = await params;
  if (!isDayKey(date)) {
    return NextResponse.json({ status: 'error', message: 'date must be a day, YYYY-MM-DD' }, { status: 400 });
  }
  return NextResponse.json(saved(await getDailyLog(date)));
}

/**
 * Why a body's `time` cannot be written, or null when it can: null (clear
 * the day), `{}` (declare nothing) or minutes by area, each area known and
 * each value on the step -- the store's own rules (`isTimeArea`,
 * `isTimeMinutes`), checked here whole so a body with one bad area writes
 * nothing.
 *
 * @param {unknown} time
 * @returns {string | null}
 */
function timeProblem(time) {
  if (time === null) return null;
  if (typeof time !== 'object' || Array.isArray(time)) {
    return 'time must be null, {} or minutes by area, received ' + JSON.stringify(time);
  }
  for (const [area, minutes] of Object.entries(time)) {
    if (!isTimeArea(area)) return 'time names an unknown area, ' + JSON.stringify(area);
    if (!isTimeMinutes(minutes)) {
      return 'time for ' + area + ' must be whole half hours in minutes, received ' + JSON.stringify(minutes);
    }
  }
  return null;
}

/**
 * Give a day its mood, its energy or both, or clear either (#243, ADR 0035,
 * ADR 0037), and declare its time against areas. The day is the address; the
 * body names any of `mood`, `energy` -- each a whole number on the scale or
 * null -- and `time`: minutes by area (each area named is set, absolute, so a
 * retry never doubles it; 0 removes it), `{}` to declare nothing (a day
 * already declared is left as it is), or null to clear the day back to not
 * declared. Nothing else -- the old `{ rating }` included. The store refuses
 * a future day and a value off its scale; this route checks the request's
 * shape, and checks every value with the store's own rule before writing
 * any, so a body with one good value and one bad one writes nothing.
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
  if (keys.length === 0 || keys.some((key) => !FIELDS.includes(key))) {
    return NextResponse.json({ status: 'error', message: 'expected { mood }, { energy } and/or { time }' }, { status: 400 });
  }
  const invalid = DAY_READINGS.find((key) => key in body && !isDayReading(body[key]));
  if (invalid !== undefined) {
    return NextResponse.json(
      { status: 'error', message: invalid + ' must be a whole number on the scale or null, received ' + JSON.stringify(body[invalid]) },
      { status: 400 }
    );
  }
  const problem = 'time' in body ? timeProblem(body.time) : null;
  if (problem !== null) return NextResponse.json({ status: 'error', message: problem }, { status: 400 });

  try {
    let log = await getDailyLog(date);
    if ('mood' in body) log = await setDayMood({ date, mood: body.mood });
    if ('energy' in body) log = await setDayEnergy({ date, energy: body.energy });
    if ('time' in body) {
      const time = /** @type {Record<string, number> | null} */ (body.time);
      if (time === null) log = await clearDayTime({ date });
      else if (Object.keys(time).length === 0) log = await declareNoTime({ date });
      else for (const [area, minutes] of Object.entries(time)) log = await setDayTime({ date, area, minutes });
    }
    return NextResponse.json(saved(log));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[days] could not save the day ' + date + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
