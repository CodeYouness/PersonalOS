import { NextResponse } from 'next/server';

import { limits } from '@/personalos.config.js';
import { getCaptureProducedRecord, getCaptures, isCaptureRecordLocked } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * The read side of the capture log drawer (roadmap item 11). Each capture is
 * enriched with what it produced, if there is still something to find, and
 * whether that record has been touched since the capture created it. Nothing
 * downstream uses `locked` yet -- Undo and Refile (#22, #23) do -- but
 * computing it here means those tickets never have to revisit this endpoint.
 */
export async function GET() {
  try {
    const captures = await getCaptures({ limit: limits.captureLogCount });
    const rows = await Promise.all(captures.map(enrichCapture));
    return NextResponse.json({ captures: rows });
  } catch (error) {
    // Never an empty catch: a swallowed error here would render as an
    // honest-looking empty log instead of the outage it actually is.
    const message = error instanceof Error ? error.message : String(error);
    console.error('[captures] could not read the capture log:', message);
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}

/** @param {import('@/lib/domain/types.js').Capture} capture */
async function enrichCapture(capture) {
  const record = await getCaptureProducedRecord(capture);
  return {
    id: capture.id,
    text: capture.text,
    destination: capture.destination,
    route: capture.route,
    createdAt: capture.createdAt,
    produced: record && { id: record.id, title: 'title' in record ? record.title : record.name },
    locked: record !== null && isCaptureRecordLocked(record),
  };
}
