import { NextResponse } from 'next/server';

import { isDayKey } from '@/lib/domain/dates.js';
import { getJournalDay, writeJournalEntry } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** What an entry is written with (#159). Nothing else is taken from the body. */
const FIELDS = ['date', 'text'];

/**
 * One day of the journal (#159), oldest entry first: `?date=YYYY-MM-DD`.
 * Reads what is saved and never calls the model (rule 3).
 *
 * @param {Request} request
 */
export async function GET(request) {
  const date = new URL(request.url).searchParams.get('date');
  if (!isDayKey(date)) {
    return NextResponse.json({ status: 'error', message: 'date must be YYYY-MM-DD' }, { status: 400 });
  }
  const dayKey = /** @type {string} */ (date);
  return NextResponse.json({ ok: true, date: dayKey, entries: await getJournalDay(dayKey) });
}

/**
 * Write an entry on the day the Journal screen shows (#159). The store
 * refuses empty text and a day after today, and records `journal.written`.
 *
 * @param {Request} request
 */
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ status: 'error', message: 'expected a JSON object' }, { status: 400 });
  }
  const unknown = Object.keys(body).filter((key) => !FIELDS.includes(key));
  if (unknown.length > 0) {
    const message = 'not written here: ' + unknown.join(', ');
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }

  try {
    const entry = await writeJournalEntry(body);
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[journal] could not write an entry:', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
