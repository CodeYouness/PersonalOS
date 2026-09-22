import { NextResponse } from 'next/server';

import { getTask, updateTask } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * The fields the CRM detail panel edits (#53). The store accepts more on a
 * task -- `completedAt`, `position`, `bandSetOn` -- but those belong to
 * Complete/Reopen, ordering and the band itself, so a request naming one
 * is refused here rather than quietly passed through.
 */
const EDITABLE = ['title', 'note', 'band', 'temperature', 'tags'];

/**
 * Edit a task. Any subset of the editable fields; the store validates each
 * value. Sending a band -- even the one the task already has -- restarts
 * its clock (`bandSetOn`), which is how "Today" on an overdue task
 * recommits it (docs/domain.md). Editing is not something that happened to
 * you, so no event is written.
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
    // An empty edit would still stamp `updatedAt`, which locks the producing
    // capture's Undo and Refile (ADR 0013) for a change that never happened.
    return NextResponse.json({ status: 'error', message: 'nothing to change' }, { status: 400 });
  }
  const unknown = Object.keys(body).filter((key) => !EDITABLE.includes(key));
  if (unknown.length > 0) {
    const message = 'not editable here: ' + unknown.join(', ');
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
  if ((await getTask(id)) === null) {
    return NextResponse.json({ status: 'error', message: 'no task with id ' + id }, { status: 404 });
  }

  try {
    const task = await updateTask(id, body);
    return NextResponse.json({ ok: true, task });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[tasks] could not update task ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
