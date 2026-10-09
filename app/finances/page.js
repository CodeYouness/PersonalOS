import FinanceBreakdown from '@/components/FinanceBreakdown.js';
import { today } from '@/lib/domain/dates.js';
import { financeOverview } from '@/lib/domain/derive/finance.js';
import { getAccounts, getObservations } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * The Finances screen: "where is the money" (#111). Reads the saved accounts
 * and balances once per request and renders them through the finance
 * overview -- the same derivation the Pulse card will read. Loading it never
 * calls the model or an integration (rule 3).
 */
export default async function FinancesScreen() {
  const todayKey = today();
  const [accounts, observations] = await Promise.all([getAccounts(), getObservations({})]);
  const overview = financeOverview({ accounts, observations }, todayKey);

  return (
    <section id="screen-finances" className="screen is-active">
      <div className="screen-grid">
        <FinanceBreakdown overview={overview} todayKey={todayKey} />
      </div>
    </section>
  );
}
