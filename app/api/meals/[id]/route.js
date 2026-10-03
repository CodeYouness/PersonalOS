import { NextResponse } from 'next/server';

import { deleteMeal, getMeal, updateMeal } from '@/lib/store.js';

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

/**
 * Delete a meal (#73), after the card has asked. Its links go with it, but
 * the capture that produced it stays, and so does that capture's memory
 * entry: the sentence you said is never lost (rule 7).
 *
 * @param {Request} _request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function DELETE(_request, { params }) {
  const { id } = await params;
  if ((await getMeal(id)) === null) {
    return NextResponse.json({ status: 'error', message: 'no meal with id ' + id }, { status: 404 });
  }

  try {
    await deleteMeal(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[meals] could not delete meal ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
