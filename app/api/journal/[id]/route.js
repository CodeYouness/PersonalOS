import { NextResponse } from 'next/server';

import { deleteJournalEntry, getJournalEntry, updateJournalEntry } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** What the Journal screen corrects (#160). Tags have no place on it yet. */
const EDITABLE = ['text', 'date'];

/**
 * Correct an entry: its text, or the day it is about. The store refuses a
 * day after today, and any correction while a memory is drawn from the
 * entry -- the memory quotes it (ADR 0027). Correcting is not something
 * that happened to you, so no event is written.
 *
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ status: 'error', message: 'expected a JSON object' }, { status: 400 });
  }
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ status: 'error', message: 'nothing to change' }, { status: 400 });
  }
  const unknown = Object.keys(body).filter((key) => !EDITABLE.includes(key));
  if (unknown.length > 0) {
    const message = 'not editable here: ' + unknown.join(', ');
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
  if ((await getJournalEntry(id)) === null) {
    return NextResponse.json({ status: 'error', message: 'no journal entry with id ' + id }, { status: 404 });
  }

  try {
    return NextResponse.json({ ok: true, entry: await updateJournalEntry(id, body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[journal] could not update entry ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}

/**
 * Delete a journal entry (#160), after the screen has asked how many
 * memories go with it. They do go: a memory drawn from the entry is deleted
 * with it, links and all, in the same write (ADR 0027). Nothing else it
 * was linked to is touched.
 *
 * @param {Request} _request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function DELETE(_request, { params }) {
  const { id } = await params;
  if ((await getJournalEntry(id)) === null) {
    return NextResponse.json({ status: 'error', message: 'no journal entry with id ' + id }, { status: 404 });
  }

  try {
    await deleteJournalEntry(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[journal] could not delete entry ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
