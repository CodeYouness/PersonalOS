import { NextResponse } from 'next/server';

import { undoAction } from '@/lib/actions/registry.js';
import { refuseUnlessAllowed } from '@/lib/phone-gate.js';

export const dynamic = 'force-dynamic';

/**
 * Undoes one line of a receipt (ADR 0037), as the capture log's Undo does
 * for a capture (../../../captures/[id]/undo/route.js). Gated like it: a
 * receipt is shown wherever the capture was made, the phone included, and
 * the gate is defence in depth for a path `tailscale serve` might expose.
 *
 * The refusal lives in the registry -- not found, already undone, locked
 * because what it wrote was touched since (ADR 0013), failed -- and the
 * route only maps it to a status: 404 for an action that does not exist,
 * 400 for the rest, with the reason so a screen can say which.
 *
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 */
export async function POST(request, { params }) {
  const refused = refuseUnlessAllowed(request);
  if (refused) return refused;

  const { id } = await params;
  try {
    const result = await undoAction(id);
    if (result.ok) return NextResponse.json({ ok: true });
    console.error('[actions] could not undo action ' + id + ':', result.error);
    return NextResponse.json(
      { status: 'error', reason: result.reason, message: result.error },
      { status: result.reason === 'not-found' ? 404 : 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[actions] could not undo action ' + id + ':', message);
    return NextResponse.json({ status: 'error', reason: 'failed', message }, { status: 400 });
  }
}
