import { NextResponse } from 'next/server';

import { deleteCaptureCascade } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * Delete (#21) and Refile (#23, added later as PATCH) both act on one
 * capture by id and share this file. Undo (#22) is an action rather than a
 * field update, so it gets its own route at ./undo/route.js instead of
 * living here too.
 *
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function DELETE(request, { params }) {
  const { id } = await params;
  try {
    await deleteCaptureCascade(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[captures] could not delete capture ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
