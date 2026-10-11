import { NextResponse } from 'next/server';

import { extractMemories } from '@/lib/extract.js';
import { getJournalEntry, getMemoriesDrawnFrom } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * Ask what in one entry is worth remembering (#161, ADR 0027): the entry's
 * text and what was already drawn from it go to the extract module, and its
 * proposals come back with the entry's `updatedAt` -- the version they read,
 * which an accept must still match. Writes nothing: a proposal is not a
 * memory, and one left undecided is gone.
 *
 * No model configured is an answer (200), not an error; a model that did
 * not answer is a 502 the screen offers to retry.
 *
 * @param {Request} _request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function POST(_request, { params }) {
  const { id } = await params;
  const entry = await getJournalEntry(id);
  if (entry === null) {
    return NextResponse.json({ status: 'error', message: 'no journal entry with id ' + id }, { status: 404 });
  }

  const remembered = (await getMemoriesDrawnFrom(id)).map((memory) => memory.content);
  const extraction = await extractMemories(entry.text, remembered);
  if (extraction.outcome === 'failed') {
    return NextResponse.json(
      { status: 'error', outcome: 'failed', message: "The model didn't answer." },
      { status: 502 }
    );
  }
  if (extraction.outcome === 'no-model') {
    return NextResponse.json({ ok: true, outcome: 'no-model' });
  }
  return NextResponse.json({ ok: true, outcome: 'proposals', updatedAt: entry.updatedAt, proposals: extraction.proposals });
}
