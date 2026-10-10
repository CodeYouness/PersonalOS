import { NextResponse } from 'next/server';

import { createFinanceCategory } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** What a category is added with (#136). Nothing else is taken from the body. */
const FIELDS = ['name', 'kind', 'parentId', 'fixedCost'];

/**
 * Add a category from the Finances screen (#136): a top-level one with its
 * kind, or a subcategory under a top-level one, which takes its parent's.
 * The store refuses a third level and a kind outside CATEGORY_KINDS.
 *
 * @param {Request} request
 */
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ status: 'error', message: 'expected a JSON object' }, { status: 400 });
  }
  const unknown = Object.keys(body).filter((key) => !FIELDS.includes(key));
  if (unknown.length > 0) {
    const message = 'not recorded here: ' + unknown.join(', ');
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }

  try {
    return NextResponse.json({ ok: true, category: await createFinanceCategory(body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[finance-categories] could not add a category:', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
