import CalendarCard from '@/components/CalendarCard.js';
import SessionCard from '@/components/SessionCard.js';
import TodayCard from '@/components/TodayCard.js';

export const dynamic = 'force-dynamic';

/**
 * The Home screen, ported from design/mockup.html. Today, Session and
 * Calendar are the first three cards -- the rest (compact Habits, Finance
 * pulse) follow one commit at a time, per docs/roadmap.md.
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
        <CalendarCard day={typeof day === 'string' ? day : undefined} />
      </div>
    </section>
  );
}
