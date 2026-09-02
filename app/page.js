import { getProfile, storageName } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * The bootstrap shell.
 *
 * Deliberately not the dashboard: the four screens are ported from a mockup
 * once the visual language is decided, because settling the look after the
 * components exist means writing them twice. What this page does is prove the
 * whole chain -- server component to store to adapter to disk -- with the
 * smallest possible thing on screen.
 */
export default async function Home() {
  const profile = await getProfile();

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: '3rem auto', maxWidth: '38rem' }}>
      <h1>PersonalOS</h1>
      <p>
        Foundations are in place. The data layer is live on the <code>{storageName}</code> adapter
        and this page is reading through it.
      </p>
      <p>
        Profile: <strong>{profile.name}</strong>, {profile.role} in {profile.city}. Today&rsquo;s
        focus is {profile.focus}, with {profile.habits.length} habits configured.
      </p>
      <p>
        That is seed data, not yours. Run <code>npm run data:reset</code> at any time to return to
        it. See <code>docs/roadmap.md</code> for what gets built next.
      </p>
    </main>
  );
}
