import { NextResponse } from 'next/server';

import { completeTask, getTask } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * Complete a task (#54): `completedAt` set and one `task.completed` event.
 * 404 for an unknown task, 400 when the store refuses.
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
    const task = await completeTask(id);
    return NextResponse.json({ ok: true, task });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[tasks] could not complete task ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
