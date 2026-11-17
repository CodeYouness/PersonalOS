import { NextResponse } from 'next/server';

import { updateProfile } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** The finance settings the Finances screen edits (#138, #141, ADR 0045). */
const EDITABLE = ['financeTrackedSince', 'defaultAccountId', 'financeSavingsTarget'];

/**
 * Change the finance settings: "tracked since", the day the history starts
 * at (ADR 0025), the default account a finance sentence naming none is
 * filed on (ADR 0026), and the target savings rate (ADR 0045) -- each null
 * to clear it. The store validates each value: the default account must be
 * open and valued by balance, the target a whole percent from 1 to 99.
 *
 * @param {Request} request
 */
export async function PATCH(request) {
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
    const profile = await updateProfile(body);
    // Only the settings: the rest of the profile -- habits, categories -- is
    // not this route's to hand back.
    return NextResponse.json({
      ok: true,
      settings: {
        financeTrackedSince: profile.financeTrackedSince,
        defaultAccountId: profile.defaultAccountId,
        financeSavingsTarget: profile.financeSavingsTarget,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[finance-settings] could not update:', message);
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
