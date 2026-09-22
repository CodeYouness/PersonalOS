import HabitsManager from '@/components/HabitsManager.js';
import { today } from '@/lib/domain/dates.js';
import { getProfile } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * The Habits screen, ported from design/mockup.html's `#screen-habits`.
 *
 * Only the management card (`#card-habits-manage`) is here. The summary
 * strip and the history heatmap are #40 and #39; rendered as empty shells
 * they would read as broken data rather than as "not built yet", so the
 * card takes the full width until they arrive and the grid gains its second
 * row with them.
 *
 * A server component that reads the list once per request, with only the
 * editing (`HabitsManager`) as a client island -- the same split as
 * HabitsCard and HabitsList. `todayKey` is computed here because
 * lib/domain/dates.js has no configured timezone in the browser (ADR 0012).
 */
export default async function HabitsScreen() {
  const profile = await getProfile();

  return (
    <section id="screen-habits" className="screen is-active">
      <div className="screen-grid">
        <HabitsManager habits={profile.habits} todayKey={today()} />
      </div>
    </section>
  );
}
