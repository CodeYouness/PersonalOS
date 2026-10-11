import { NextResponse } from 'next/server';

import { deleteMemoryEntry, getMemoryEntry } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * Delete a memory (#160), after the Journal screen has asked. Its links go
 * with it; the entry it was drawn from is never touched -- the writing is
 * the primary record, the memory only a reading of it (ADR 0007) -- and
 * with no memory left, that entry can be corrected again (ADR 0027).
 *
 * @param {Request} _request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function DELETE(_request, { params }) {
  const { id } = await params;
  if ((await getMemoryEntry(id)) === null) {
    return NextResponse.json({ status: 'error', message: 'no memory entry with id ' + id }, { status: 404 });
  }

  try {
    await deleteMemoryEntry(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[memory] could not delete memory ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
