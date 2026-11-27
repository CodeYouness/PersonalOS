import { NextResponse } from 'next/server';

import { fileCapture } from '@/lib/capture.js';
import { resolveClientId } from '@/lib/domain/client-id.js';
import { resolveSaidAt } from '@/lib/domain/said-at.js';
import { refuseUnlessAllowed } from '@/lib/phone-gate.js';
import { CAPTURE_ORIGINS, DESTINATIONS } from '@/personalos.config.js';

export const dynamic = 'force-dynamic';

/**
 * The capture bar's and the phone Shortcut's way in: checks what it was
 * sent, then hands the sentence to `fileCapture` (lib/capture.js), the one
 * entry point every surface files through. Nothing is written before every
 * check has passed.
 *
 * @param {Request} request
 */
export async function POST(request) {
  const refused = refuseUnlessAllowed(request);
  if (refused) return refused;

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (text === '') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  // The Nutrition card's box is the capture bar with the destination already
  // chosen. Checked before anything is written: an unknown one is refused,
  // never filed as a guess.
  const chosen = body?.destination ?? undefined;
  if (chosen !== undefined && !DESTINATIONS.includes(chosen)) {
    return NextResponse.json({ error: 'destination must be one of ' + DESTINATIONS.join(', ') }, { status: 400 });
  }

  // The surface the sentence came through. No origin is the capture bar.
  const origin = body?.origin ?? 'bar';
  if (!CAPTURE_ORIGINS.includes(origin)) {
    return NextResponse.json({ error: 'origin must be one of ' + CAPTURE_ORIGINS.join(', ') }, { status: 400 });
  }

  // When the sentence was said (ADR 0033): any past instant, a few minutes
  // ahead is now, further ahead or malformed is refused. Checked before
  // anything is written. Every day the capture decides comes from it.
  const said = resolveSaidAt(body?.saidAt);
  if (!said.ok) {
    return NextResponse.json({ error: said.error }, { status: 400 });
  }

  // The client's own id for the sentence (ADR 0033), so a resend is filed
  // once. Checked before anything is written.
  const client = resolveClientId(body?.clientId);
  if (!client.ok) {
    return NextResponse.json({ error: client.error }, { status: 400 });
  }

  return NextResponse.json(await fileCapture({ text, origin, chosen, saidAt: said.saidAt, clientId: client.clientId }));
}
