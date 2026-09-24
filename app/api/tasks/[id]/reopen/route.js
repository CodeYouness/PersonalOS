import { NextResponse } from 'next/server';

import { reopenTask, getTask } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * Reopen a completed task (#54): back on the board, no event. 404 for an
 * unknown task, 400 when the store refuses.
 *
 * @param {Request} _request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function POST(_request, { params }) {
  const { id } = await params;
  if ((await getTask(id)) === null) {
    return NextResponse.json({ status: 'error', message: 'no task with id ' + id }, { status: 404 });
  }

  try {
    const task = await reopenTask(id);
    return NextResponse.json({ ok: true, task });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[tasks] could not reopen task ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
