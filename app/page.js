/**
 * The Home screen shell, ported from design/mockup.html.
 *
 * Empty on purpose: Today and Session are the next two cards, each its own
 * commit per docs/roadmap.md. This ticket only proves the shell -- topbar,
 * layout, ported CSS -- renders in place of the old bootstrap page.
 */
export default function Home() {
  return (
    <section id="screen-home" className="screen is-active">
      <div className="screen-grid">
        <p className="caption span-12">Cards land here next, one at a time.</p>
      </div>
    </section>
  );
}
