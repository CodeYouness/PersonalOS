import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env.js';
import { getProfile, getTasks, storageName } from '@/lib/store.js';

/**
 * Routes that serve data are never cached. Next caches aggressively by
 * default, and a frozen response is the "I changed it, reloaded, and saw the
 * old value" ghost that costs an afternoon to track down.
 */
export const dynamic = 'force-dynamic';

/**
 * Is the wiring alive? Answers the three questions worth asking before
 * building anything on top: which storage is active, is the data readable,
 * and which timezone decides what "today" means.
 */
export async function GET() {
  try {
    const [profile, tasks] = await Promise.all([getProfile(), getTasks()]);

    return NextResponse.json({
      status: 'ok',
      storage: storageName,
      timezone: env.timezone,
      modelConfigured: env.anthropicApiKey !== null,
      counts: { tasks: tasks.length, habits: profile.habits.length },
    });
  } catch (error) {
    // Never an empty catch. A swallowed error here would look like healthy
    // silence, which is the worst possible answer from a health check.
    const message = error instanceof Error ? error.message : String(error);
    console.error('[health] data layer unreachable:', message);
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}
