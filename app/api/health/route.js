import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env.js';
import { netWorthAt } from '@/lib/domain/derive/finance.js';
import { today } from '@/lib/domain/dates.js';
import { dueToday } from '@/lib/domain/derive/tasks.js';
import { getAccounts, getLinks, getObservations, getProfile, getTasks, storageName } from '@/lib/store.js';

/**
 * Routes that serve data are never cached. Next caches aggressively by
 * default, and a frozen response is the "I changed it, reloaded, and saw the
 * old value" ghost that costs an afternoon to track down.
 */
export const dynamic = 'force-dynamic';

/**
 * Is the wiring alive? Answers the questions worth asking before building
 * anything on top: which storage is active, is the data readable, which
 * timezone decides what "today" means, and are the derivations running.
 *
 * Everything reported here is computed on the way out. Nothing in this
 * response is a number the store had lying around.
 */
export async function GET() {
  try {
    const todayKey = today();
    const [profile, tasks, accounts, observations, links] = await Promise.all([
      getProfile(),
      getTasks(),
      getAccounts(),
      getObservations({}),
      getLinks({}),
    ]);

    const worth = netWorthAt(accounts, observations, todayKey);

    return NextResponse.json({
      status: 'ok',
      storage: storageName,
      timezone: env.timezone,
      today: todayKey,
      modelConfigured: env.anthropicApiKey !== null,
      counts: {
        tasks: tasks.length,
        habits: profile.habits.length,
        links: links.length,
        accounts: accounts.length,
      },
      derived: {
        dueToday: dueToday(tasks, todayKey).length,
        netWorthMinorUnits: worth.netWorth,
        unmeasuredAccounts: worth.unmeasuredAccounts,
      },
    });
  } catch (error) {
    // Never an empty catch. A swallowed error here would look like healthy
    // silence, which is the worst possible answer from a health check.
    const message = error instanceof Error ? error.message : String(error);
    console.error('[health] data layer unreachable:', message);
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}
