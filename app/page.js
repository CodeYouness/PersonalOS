import CalendarCard from '@/components/CalendarCard.js';
import CheckinPanel from '@/components/CheckinPanel.js';
import GoalsCard from '@/components/GoalsCard.js';
import HabitsCard from '@/components/HabitsCard.js';
import PulseCard from '@/components/PulseCard.js';
import SessionCard from '@/components/SessionCard.js';
import TodayCard from '@/components/TodayCard.js';

export const dynamic = 'force-dynamic';

/**
 * The Home screen, ported from design/mockup.html. The check-in panel (ADR
 * 0037) comes first, the full width: it is the product, and in the evening
 * the main thing here. It took the Close the day card's place; no mockup
 * draws it (ADR 0037: a prototype, corrected on use). The cards below keep
 * their order: Today; span-8 Session + span-4 Habits in one row, span-8
 * Calendar + span-4 Pulse the next, and span-4 Goals the last.
 *
 * @param {{ searchParams: Promise<{ day?: string | string[] }> }} props
 */
export default async function Home({ searchParams }) {
  const { day } = await searchParams;

  return (
    <section id="screen-home" className="screen is-active">
      <div className="screen-grid">
        <CheckinPanel />
        <TodayCard />
        <SessionCard />
        <HabitsCard />
        <CalendarCard day={typeof day === 'string' ? day : undefined} />
        <PulseCard />
        <GoalsCard />
      </div>
    </section>
  );
}
