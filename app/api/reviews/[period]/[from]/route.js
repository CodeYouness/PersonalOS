import { NextResponse } from 'next/server';

import { deleteReview, getReview, saveReview } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** What a save may name; the period and day come from the address. */
const EDITABLE = ['answers', 'lever', 'completed'];

/**
 * @param {unknown} error
 * @param {string} what
 */
function refusal(error, what) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[reviews] could not ' + what + ':', message);
  return NextResponse.json({ status: 'error', message }, { status: 400 });
}

/**
 * Read one review. A week with no review is `review: null`, not an error: the
 * screen shows an empty form for it (ADR 0034).
 *
 * @param {Request} _request
 * @param {{ params: Promise<{ period: string, from: string }> }} context
 */
export async function GET(_request, { params }) {
  const { period, from } = await params;
  try {
    return NextResponse.json({ ok: true, review: await getReview(period, from) });
  } catch (error) {
    return refusal(error, 'read the review');
  }
}

/**
 * Write one review: any subset of `answers`, `lever` and `completed: true`.
 * Creates it if absent, otherwise merges only what was sent. The store checks
 * every value; a refusal writes nothing.
 *
 * @param {Request} request
 * @param {{ params: Promise<{ period: string, from: string }> }} context
 */
export async function PUT(request, { params }) {
  const { period, from } = await params;
  const body = await request.json().catch(() => null);

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ status: 'error', message: 'expected a JSON object' }, { status: 400 });
  }
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ status: 'error', message: 'nothing to change' }, { status: 400 });
  }
  const unknown = Object.keys(body).filter((key) => !EDITABLE.includes(key));
  if (unknown.length > 0) {
    const message = 'not editable here: ' + unknown.join(', ');
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }

  try {
    return NextResponse.json({ ok: true, review: await saveReview({ ...body, period, from }) });
  } catch (error) {
    return refusal(error, 'save the review');
  }
}

/**
 * Delete a review. Its `review.completed` event stays: it records that the
 * week was closed, whatever became of the words.
 *
 * @param {Request} _request
 * @param {{ params: Promise<{ period: string, from: string }> }} context
 */
export async function DELETE(_request, { params }) {
  const { period, from } = await params;
  try {
    if (!(await deleteReview(period, from))) {
      return NextResponse.json({ status: 'error', message: 'no review for ' + period + ' ' + from }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return refusal(error, 'delete the review');
  }
}
