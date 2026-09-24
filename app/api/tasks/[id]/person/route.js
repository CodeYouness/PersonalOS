import { NextResponse } from 'next/server';

import { getTask, setTaskPerson } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * Who a task is owed to (#55): `{ personId }` links that person, replacing
 * any other; `{ personId: null }` clears it. 404 for an unknown task, 400
 * for anything but an existing person's id or null.
 *
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function PUT(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const personId = body?.personId;
  if (personId !== null && typeof personId !== 'string') {
    const message = 'personId must be a person id or null';
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
  if ((await getTask(id)) === null) {
    return NextResponse.json({ status: 'error', message: 'no task with id ' + id }, { status: 404 });
  }

  try {
    await setTaskPerson(id, personId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[tasks] could not set the person of task ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
