import SessionCard from '@/components/SessionCard.js';
import TodayCard from '@/components/TodayCard.js';

export const dynamic = 'force-dynamic';

/**
 * The Home screen, ported from design/mockup.html. Today and Session are
 * the first two cards -- the rest (compact Habits, Calendar, Finance pulse)
 * follow one commit at a time, per docs/roadmap.md.
 */
export default function Home() {
  return (
    <section id="screen-home" className="screen is-active">
      <div className="screen-grid">
        <TodayCard />
        <SessionCard />
      </div>
    </section>
  );
}
