import { NextResponse } from 'next/server';

import { getMeal, updateMeal } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * Correct a meal from the Nutrition card (#72): any subset of its name,
 * time and four numbers; the store validates each value, recomputes
 * calories when a macro changes, and clears `estimated` (ADR 0019).
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
    // An empty edit would still stamp `updatedAt` and clear `estimated`,
    // locking the producing capture's Undo and Refile for nothing.
    return NextResponse.json({ status: 'error', message: 'nothing to change' }, { status: 400 });
  }
  if ((await getMeal(id)) === null) {
    return NextResponse.json({ status: 'error', message: 'no meal with id ' + id }, { status: 404 });
  }

  try {
    const meal = await updateMeal(id, body);
    return NextResponse.json({ ok: true, meal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[meals] could not update meal ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
