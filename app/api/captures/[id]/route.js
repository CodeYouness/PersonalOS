import { NextResponse } from 'next/server';

import { classify } from '@/lib/classify.js';
import { deleteCaptureCascade, getCapture, refileCapture } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * Delete (#21) and Refile (#23) both act on one capture by id and share
 * this file. Undo (#22) is an action rather than a field update, so it gets
 * its own route at ./undo/route.js instead of living here too.
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

/**
 * Refiling into `nutrition` asks the model to estimate the meal, the same
 * extraction the capture route runs for a sentence already known to be one;
 * without a model it is filed by name only (ADR 0019).
 *
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const destination = typeof body?.destination === 'string' ? body.destination : '';

  try {
    const capture = destination === 'nutrition' ? await getCapture(id) : null;
    // ponytail: "last night" resolves against the day of the refile, not the
    // day it was said; pass the capture's day to classify if old captures
    // start getting refiled.
    const meal = capture === null ? undefined : (await classify(capture.text, 'nutrition')).fields;
    const recordId = await refileCapture(id, destination, meal);
    return NextResponse.json({ ok: true, recordId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[captures] could not refile capture ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
