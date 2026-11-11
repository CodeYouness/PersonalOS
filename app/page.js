import CalendarCard from '@/components/CalendarCard.js';
import CloseDayCard from '@/components/CloseDayCard.js';
import GoalsCard from '@/components/GoalsCard.js';
import HabitsCard from '@/components/HabitsCard.js';
import PulseCard from '@/components/PulseCard.js';
import SessionCard from '@/components/SessionCard.js';
import TodayCard from '@/components/TodayCard.js';

export const dynamic = 'force-dynamic';

/**
 * The Home screen, ported from design/mockup.html. Habits sits between
 * Session and Calendar, matching the mockup's row: span-8 Session + span-4
 * Habits fill one row, span-8 Calendar + span-4 Goals the next, and span-4
 * Pulse + span-8 Close the day the last -- the mockup's order, as redrawn in
 * #238.
 *
 * @param {{ searchParams: Promise<{ day?: string | string[] }> }} props
 */
export default async function Home({ searchParams }) {
  const { day } = await searchParams;

  return (
    <section id="screen-home" className="screen is-active">
      <div className="screen-grid">
        <TodayCard />
        <SessionCard />
        <HabitsCard />
        <CalendarCard day={typeof day === 'string' ? day : undefined} />
        <GoalsCard />
        <PulseCard />
        <CloseDayCard />
      </div>
    </section>
  );
}
