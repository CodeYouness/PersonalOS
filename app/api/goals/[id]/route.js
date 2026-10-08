import { NextResponse } from 'next/server';

import { deleteGoal, getGoal, updateGoal } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * The fields the Goals panel corrects (#98). `done` belongs to Done and
 * Reopen, so a request naming it is refused here rather than passed through.
 */
const EDITABLE = ['name', 'kind', 'horizon', 'targetDate', 'progress'];

/**
 * Correct a goal. Any subset of the editable fields; the store validates
 * each value. A different horizon restarts the goal's age, the same one
 * does not (ADR 0021). The store refuses a done goal: it is reopened first.
 * Correcting is not something that happened to you, so no event is written.
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
  if ((await getGoal(id)) === null) {
    return NextResponse.json({ status: 'error', message: 'no goal with id ' + id }, { status: 404 });
  }

  try {
    return NextResponse.json({ ok: true, goal: await updateGoal(id, body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[goals] could not update goal ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}

/**
 * Delete a goal (#100), after the panel has asked. Its links go with it --
 * an edge pointing at nothing is worse than no edge -- but a capture that
 * produced it stays, and so does that capture's memory entry: the sentence
 * you said is never lost (rule 7).
 *
 * @param {Request} _request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function DELETE(_request, { params }) {
  const { id } = await params;
  if ((await getGoal(id)) === null) {
    return NextResponse.json({ status: 'error', message: 'no goal with id ' + id }, { status: 404 });
  }

  try {
    await deleteGoal(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[goals] could not delete goal ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
