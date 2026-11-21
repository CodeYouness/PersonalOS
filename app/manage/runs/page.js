import Link from 'next/link';

import RunLog from '@/components/RunLog.js';
import { runLogView } from '@/lib/domain/derive/run-log.js';
import { getRuns } from '@/lib/store.js';
import { MODEL_PRICES, SCHEDULES } from '@/personalos.config.js';

export const dynamic = 'force-dynamic';

/**
 * The run log under Manage (#289, spec #285): whether anything that runs on
 * its own is broken, in one look. Each configured schedule with its last run
 * and when it is next due, then the runs, newest first.
 *
 * Reads saved values only (rule 3): the run log from the store, "next due"
 * from the scheduler's own derivation. Opening it starts no run and calls no
 * model and no integration. The cost of a model run is derived from its
 * tokens for display, never stored.
 */
export default async function RunLogScreen() {
  const runs = await getRuns();
  const view = runLogView({ schedules: SCHEDULES, runs, now: new Date() });

  return (
    <section id="screen-runs" className="screen is-active">
      <div className="screen-grid">
        <header className="span-12 runlog-head">
          <h1 className="headline">Run log</h1>
          <Link className="caption" href="/finances#finance-manage">
            Back to Manage
          </Link>
        </header>
        <RunLog view={view} prices={MODEL_PRICES} />
      </div>
    </section>
  );
}
