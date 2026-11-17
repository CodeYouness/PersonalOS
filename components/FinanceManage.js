/**
 * Manage, at the bottom of the Finances screen (ADR 0048): what you set up
 * once and come back to rarely -- adding an account, the categories, the
 * settings -- each folded in a `<details>` of its own, so the screen above
 * reads money, not forms. A fold needs no client state and works on the
 * server-rendered page; one you open stays open while you work in it, since
 * a re-read after a write leaves an attribute React does not set alone.
 *
 * What the address selects is not here: an account's panel opens beside the
 * Net worth card, where its row is clicked, and a transaction's beside the
 * list it is picked from. Nothing in the address belongs to these three, so
 * a fold opens by itself only when its part is the first thing to do: adding
 * an account while there is none, the categories while there are none.
 *
 * @param {{
 *   accountCount: number,
 *   categoryCount: number,
 *   addAccount: import('react').ReactNode,
 *   categories: import('react').ReactNode,
 *   settings: import('react').ReactNode,
 * }} props
 */
export default function FinanceManage({ accountCount, categoryCount, addAccount, categories, settings }) {
  return (
    <section id="finance-manage" className="finance-manage span-12" aria-labelledby="finance-manage-title">
      <h2 id="finance-manage-title" className="subhead">
        Manage
      </h2>
      <div className="finance-manage-parts">
        <Part
          id="card-finance-add-account"
          name="Add an account"
          note={accountCount === 0 ? 'No accounts yet' : accountCount === 1 ? '1 account' : accountCount + ' accounts'}
          open={accountCount === 0}
        >
          {addAccount}
        </Part>
        <Part
          id="card-finance-categories"
          name="Categories"
          note={categoryCount === 0 ? 'No categories yet' : categoryCount === 1 ? '1 category' : categoryCount + ' categories'}
          open={categoryCount === 0}
        >
          {categories}
        </Part>
        <Part id="card-finance-settings" name="Settings" note="Tracked since, default account, savings target" open={false}>
          {settings}
        </Part>
      </div>
    </section>
  );
}

/**
 * One fold: a card whose head is the summary, the whole head the target.
 *
 * @param {{ id: string, name: string, note: string, open: boolean, children: import('react').ReactNode }} props
 */
function Part({ id, name, note, open, children }) {
  return (
    <details id={id} className="card finance-manage-part" open={open || undefined}>
      <summary className="finance-manage-summary">
        <span className="finance-fold-mark" aria-hidden="true" />
        <span className="eyebrow">{name}</span>
        <span className="caption">{note}</span>
      </summary>
      {children}
    </details>
  );
}
