import { NextResponse } from 'next/server';

import { undoCaptureFiling } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * Undo (#22) is an action, not a field update, so it does not fit PATCH the
 * way Refile's destination change does -- it gets its own route rather than
 * sharing ../route.js.
 *
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function POST(request, { params }) {
  const { id } = await params;
  try {
    await undoCaptureFiling(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[captures] could not undo capture ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
