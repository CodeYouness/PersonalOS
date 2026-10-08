import CalendarCard from '@/components/CalendarCard.js';
import GoalsCard from '@/components/GoalsCard.js';
import HabitsCard from '@/components/HabitsCard.js';
import SessionCard from '@/components/SessionCard.js';
import TodayCard from '@/components/TodayCard.js';

export const dynamic = 'force-dynamic';

/**
 * The Home screen, ported from design/mockup.html. Habits sits between
 * Session and Calendar, matching the mockup's row: span-8 Session + span-4
 * Habits fill one row, span-8 Calendar + span-4 Goals the next -- Goals in
 * the slot the mockup kept for Finance pulse, which has yet to be built
 * (docs/roadmap.md).
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
      </div>
    </section>
  );
}
