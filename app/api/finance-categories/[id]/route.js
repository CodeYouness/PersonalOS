import { NextResponse } from 'next/server';

import { deleteFinanceCategory, getProfile, updateFinanceCategory } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** What managing a category changes (#136). */
const EDITABLE = ['name', 'kind', 'parentId', 'fixedCost', 'archived'];

/** @param {string} id */
async function exists(id) {
  return (await getProfile()).financeCategories.some((category) => category.id === id);
}

/**
 * Rename, flag as a fixed cost, archive or restore a category, move a
 * subcategory under another parent, or change an unused top-level
 * category's kind. The store refuses a third level, a move across kinds and
 * a kind change on a category in use.
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
    return NextResponse.json({ status: 'error', message: 'nothing to change' }, { status: 400 });
  }
  const unknown = Object.keys(body).filter((key) => !EDITABLE.includes(key));
  if (unknown.length > 0) {
    const message = 'not editable here: ' + unknown.join(', ');
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
  if (!(await exists(id))) {
    return NextResponse.json({ status: 'error', message: 'no category with id ' + id }, { status: 404 });
  }

  try {
    return NextResponse.json({ ok: true, category: await updateFinanceCategory(id, body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[finance-categories] could not update ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}

/**
 * Delete a category made by mistake, after the screen has asked. Refused
 * while it or a subcategory is in use -- that one is archived instead.
 *
 * @param {Request} _request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function DELETE(_request, { params }) {
  const { id } = await params;
  if (!(await exists(id))) {
    return NextResponse.json({ status: 'error', message: 'no category with id ' + id }, { status: 404 });
  }

  try {
    await deleteFinanceCategory(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[finance-categories] could not delete ' + id + ':', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
