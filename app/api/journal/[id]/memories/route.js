import { NextResponse } from 'next/server';

import { acceptJournalProposal, getJournalEntry } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** What an accepted proposal carries (#162). Nothing else is taken from the body. */
const FIELDS = ['type', 'content', 'updatedAt'];

/**
 * Accept a proposal as a memory of this entry (#162, ADR 0027): the type
 * and content as you left them, and the entry's `updatedAt` the proposals
 * were read with. The store refuses it when the entry has changed since, or
 * is gone, and writes the memory with confidence 1, valid from the entry's
 * day, derived from it; and records `memory.saved`.
 *
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ status: 'error', message: 'expected a JSON object' }, { status: 400 });
  }
  const unknown = Object.keys(body).filter((key) => !FIELDS.includes(key));
  if (unknown.length > 0) {
    const message = 'not accepted here: ' + unknown.join(', ');
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
  if ((await getJournalEntry(id)) === null) {
    return NextResponse.json({ status: 'error', message: 'no journal entry with id ' + id }, { status: 404 });
  }

  try {
    const memory = await acceptJournalProposal(id, body);
    return NextResponse.json({ ok: true, memory });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[journal] could not accept a proposal for entry ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
