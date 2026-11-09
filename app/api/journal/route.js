import { NextResponse } from 'next/server';

import { resolveClientId } from '@/lib/domain/client-id.js';
import { isDayKey } from '@/lib/domain/dates.js';
import { resolveSaidAt } from '@/lib/domain/said-at.js';
import { refuseUnlessAllowed } from '@/lib/phone-gate.js';
import { getJournalDay, writeJournalEntryOnce } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** What an entry is written with (#159). Nothing else is taken from the body. */
const FIELDS = ['date', 'text', 'saidAt', 'clientId'];

/**
 * One day of the journal (#159), oldest entry first: `?date=YYYY-MM-DD`.
 * Reads what is saved and never calls the model (rule 3).
 *
 * @param {Request} request
 */
export async function GET(request) {
  const refused = refuseUnlessAllowed(request);
  if (refused) return refused;

  const date = new URL(request.url).searchParams.get('date');
  if (!isDayKey(date)) {
    return NextResponse.json({ status: 'error', message: 'date must be YYYY-MM-DD' }, { status: 400 });
  }
  const dayKey = /** @type {string} */ (date);
  return NextResponse.json({ ok: true, date: dayKey, entries: await getJournalDay(dayKey) });
}

/**
 * A refusal the browser reads as `message` and the phone Shortcut reads as
 * `error` (docs/shortcuts.md): the same short reason under both names.
 *
 * @param {string} message
 */
function refusal(message) {
  return NextResponse.json({ status: 'error', message, error: message }, { status: 400 });
}

/**
 * Write an entry on the day the Journal screen shows (#159), or, with
 * `saidAt`, on the day it was said (ADR 0033, ticket #230). The store
 * refuses empty text and a day after today, and records `journal.written`.
 * A repeated `clientId` writes nothing and answers the entry already there.
 *
 * The success body carries `receiptLine`, the field the phone Shortcut tests
 * exactly as it does for a capture: its presence means the entry is written.
 *
 * @param {Request} request
 */
export async function POST(request) {
  const refused = refuseUnlessAllowed(request);
  if (refused) return refused;

  const body = await request.json().catch(() => null);
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return refusal('expected a JSON object');
  }
  const unknown = Object.keys(body).filter((key) => !FIELDS.includes(key));
  if (unknown.length > 0) return refusal('not written here: ' + unknown.join(', '));

  // Checked before anything is written, by the one rule a capture uses.
  const said = resolveSaidAt(body.saidAt);
  if (!said.ok) return refusal(said.error);
  const client = resolveClientId(body.clientId);
  if (!client.ok) return refusal(client.error);

  try {
    const { entry } = await writeJournalEntryOnce({
      date: body.date,
      text: body.text,
      saidAt: said.saidAt ?? undefined,
      clientId: client.clientId ?? undefined,
    });
    return NextResponse.json({ ok: true, entry, receiptLine: 'journal · Written for ' + entry.date });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[journal] could not write an entry:', message);
    return refusal(message);
  }
}
