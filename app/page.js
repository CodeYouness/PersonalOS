import CalendarCard from '@/components/CalendarCard.js';
import HabitsCard from '@/components/HabitsCard.js';
import SessionCard from '@/components/SessionCard.js';
import TodayCard from '@/components/TodayCard.js';

export const dynamic = 'force-dynamic';

/**
 * The Home screen, ported from design/mockup.html. Today, Session, Habits
 * and Calendar are the first four cards -- the rest (Finance pulse) follows,
 * per docs/roadmap.md. Habits sits between Session and Calendar, matching
 * the mockup's row: span-8 Session + span-4 Habits fill one row, span-8
 * Calendar starts the next.
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
      </div>
    </section>
  );
}
