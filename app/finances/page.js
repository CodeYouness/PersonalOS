import FinanceAccountDetail, { FinanceAddAccount } from '@/components/FinanceAccountDetail.js';
import FinanceBreakdown from '@/components/FinanceBreakdown.js';
import FinanceCategories from '@/components/FinanceCategories.js';
import FinanceFlows from '@/components/FinanceFlows.js';
import FinanceManage from '@/components/FinanceManage.js';
import FinanceSettings from '@/components/FinanceSettings.js';
import FinanceTags from '@/components/FinanceTags.js';
import { lineName } from '@/components/finance.js';
import { monthLabel } from '@/components/format.js';
import FinanceTransactionDetail, { FinanceMovementForm } from '@/components/FinanceTransactionDetail.js';
import FinanceTransactions from '@/components/FinanceTransactions.js';
import { financesInterest, financesQuery, financesRefunded, financesSpan, financesUncounted, financesView } from '@/lib/domain/addresses.js';
import { isMonthKey, monthOf, today, yearOf } from '@/lib/domain/dates.js';
import {
  allocationAccounts,
  calendarYearFlows,
  dayColumns,
  financeOverview,
  flowMonths,
  lineAverages,
  lineMovements,
  listedTransactions,
  monthFlows,
  monthsWith,
  movementLines,
  periodInvested,
  quietAccounts,
  tagFlows,
  uncategorisedCounts,
  worthChart,
  yearColumns,
  yearFlows,
} from '@/lib/domain/derive/finance.js';
import { investmentReturns } from '@/lib/domain/derive/investments.js';
import { refundPairs, refundPanel } from '@/lib/domain/derive/refunds.js';
import { brokerStaleness } from '@/lib/domain/derive/sync-staleness.js';
import { getAccount, getFinanceInputs, getProfile, getSyncStates, getTransaction } from '@/lib/store.js';
import { limits } from '@/personalos.config.js';

export const dynamic = 'force-dynamic';

/**
 * The Finances screen: "where is the money" (#111), and since #134 how it
 * moved. Reads the saved accounts, balances, trades, prices and transactions
 * once per request and renders them through the finance overview -- the
 * same derivation Home's money tile, notes and net worth line read. Loading
 * it never calls the model or an integration (rule 3).
 *
 * Top to bottom (ADR 0048): Net worth -- the headline, the line over all
 * tracked time, the allocation, the accounts, the quiet ones folded -- with
 * the selected account's panel beside it; Income & spending; By tag;
 * Transactions with the panel that records a movement or shows the selected
 * one; and Manage -- add an account, the categories (#136), the settings
 * (#138) -- each folded.
 *
 * The address holds where you are, each by id or key so a capture landing
 * never moves it: `?account=<id>` opens an account's panel (#114);
 * `?month=YYYY-MM` is the month whose transactions are listed, today's when
 * absent or not a month; `?transaction=<id>` opens a transaction's panel
 * (#134). An id that no longer exists selects nothing. With no account
 * selected, the Net worth card takes the whole row; with no transaction
 * selected, the panel beside the list records a movement. The monthly
 * history has no card of its own: the Net worth card's line draws all of it
 * (ADRs 0047, 0048), whatever month is read.
 *
 * `?category=<line>` selects a line of the Income & spending section (#137)
 * -- a category, a parent's own movements (ADR 0057), or Uncategorised
 * spending or income -- and lists that
 * month's transactions it counts; one that no longer exists selects
 * nothing. The month is one the section offers -- from "tracked since" or
 * the first transaction to today's, and the month of the selected
 * transaction -- and today's otherwise. The Settings
 * card (#138) sets "tracked since".
 *
 * `?period=year` has the section read the month's calendar year to date
 * instead of the month (calendarYearFlows); anything else, or nothing, reads
 * the month. A selected line then lists the year's transactions.
 *
 * The section always shows its breakdown on the right -- the lines the
 * period holds, every income line, no comparison (ADR 0057) -- where a
 * subcategory, a parent's own row ("No subcategory", `?category=own:<id>`)
 * or a line without any opens its movements of the period in place
 * (lineMovements). On its left it draws the
 * circle of the period, or with `?view=columns` its columns -- a month's
 * days (dayColumns) or a year's months (yearColumns), computed only then --
 * with the four totals and the rest of the summary under it (ADR 0053); an
 * old `?view=table` reads as the circle. What the circle calls invested is
 * read from the trades of the period (periodInvested), never from a
 * transaction. A movement counted over several months (ADR 0052) is read in
 * each of them by every flow, listed by its date, and on no day of a month's
 * columns. An old `?chart=` from before ADR 0048 is read by nothing.
 *
 * `?tag=<tag>` selects a tag of the By tag card (ADR 0046) -- one that a
 * movement carries, else nothing -- and lists the period's movements it
 * counts, or, with `?span=all`, all of them. One selection at a time: with
 * a line selected too (an address typed by hand), the line wins. A month or
 * a year with nothing selected lists only its newest `limits.financeListMax`
 * (100) movements, says how many more, and `?span=all` lists them all (ADR
 * 0048, 0058).
 *
 * Each savings rate is set against the target savings rate, when one is set
 * in Settings, under Manage (ADR 0045); where a percent says nothing -- no
 * income, or below −100% -- the card shows what was saved instead
 * (savingsReading, ADR 0059).
 *
 * The By tag card shows only when the period holds a tagged movement or a tag
 * is selected (ADR 0059), and never when no movement has a tag.
 *
 * A refund paired with its purchase (ADR 0055) is read through the pairs
 * every flow is handed (refundPairs): it reduces the purchase's spending, in
 * the purchase's category, on its own date. The lists -- the Transactions
 * card and the movements a line opens in place -- leave the pair out and say
 * how many they left out, unless `?refunded=show`; a purchase partly refunded
 * shows what is left of it. The selected movement's panel offers the
 * purchases a refund could be paired with, or shows its pair (refundPanel).
 * Balances and net worth never read the pairs: both movements moved money.
 *
 * A deposit's interest (ADR 0056) -- a few cents a day, and the tax withheld
 * on it -- is one row per account and month in both lists (foldInterest),
 * each line's at what the line counts, unless `?interest=show` lists them
 * one by one. Display only: no figure reads it.
 *
 * The Transactions card (ADR 0058) leaves out, with nothing selected, a
 * movement not counted -- in no total -- unless `?uncounted=show`; the
 * movement open in the panel is never left out, refunded or not counted.
 * `?q=<text>` (financesQuery: trimmed, capped) searches it: every movement of
 * all time that matches, nothing hidden or folded, capped as a period is. A
 * selected line or tag wins over a search, as a line wins over a tag, and
 * the search is then dropped from the place. Display only: no figure reads
 * either, and a search never calls the model (rule 3).
 *
 * What the holdings earned (investmentReturns, ADR 0051) is read once: the
 * Net worth card's Invested section and Investments fold show all of them,
 * and a selected holding's panel shows its own.
 *
 * @param {{ searchParams: Promise<{ account?: string | string[], month?: string | string[], period?: string | string[], view?: string | string[], transaction?: string | string[], category?: string | string[], tag?: string | string[], span?: string | string[], refunded?: string | string[], interest?: string | string[], uncounted?: string | string[], q?: string | string[] }> }} props
 */
export default async function FinancesScreen({ searchParams }) {
  const {
    account: accountParam,
    month: monthParam,
    period: periodParam,
    view: viewParam,
    transaction: transactionParam,
    category: categoryParam,
    tag: tagParam,
    span: spanParam,
    refunded: refundedParam,
    interest: interestParam,
    uncounted: uncountedParam,
    q: queryParam,
  } = await searchParams;
  const todayKey = today();
  const [finance, syncStates, selected, profile, selectedTransaction] = await Promise.all([
    getFinanceInputs(),
    getSyncStates(),
    typeof accountParam === 'string' ? getAccount(accountParam) : null,
    getProfile(),
    typeof transactionParam === 'string' ? getTransaction(transactionParam) : null,
  ]);
  const { accounts, observations, trades, prices, transactions } = finance;
  const overview = financeOverview(finance, todayKey);
  const investments = investmentReturns(finance, todayKey);
  const earned = selected === null ? undefined : [...investments.holdings, ...investments.archived].find((row) => row.account.id === selected.id);
  const staleness = brokerStaleness(syncStates, todayKey);
  const categories = profile.financeCategories;
  const refunds = refundPairs(transactions, finance.refundLinks ?? []);
  const refunded = financesRefunded(refundedParam);
  const interest = financesInterest(interestParam);
  const uncounted = financesUncounted(uncountedParam);
  // The month of the selected transaction is on offer even when the section
  // would not (before "tracked since", or after today): a citation links to
  // a transaction with its month, and the list beside it has to contain it.
  const months = monthsWith(
    flowMonths(transactions, todayKey, finance.trackedSince),
    selectedTransaction === null ? null : monthOf(selectedTransaction.date)
  );
  const month = isMonthKey(monthParam) && months.includes(/** @type {string} */ (monthParam)) ? /** @type {string} */ (monthParam) : monthOf(todayKey);
  const category = typeof categoryParam === 'string' && lineName(categoryParam, categories) !== null ? categoryParam : null;
  /** @type {'month' | 'year'} */
  const period = periodParam === 'year' ? 'year' : 'month';
  const year = period === 'year' ? calendarYearFlows(transactions, categories, month, months, refunds) : null;
  const flows = year ?? monthFlows(transactions, categories, month, refunds);
  const periodMonths = year?.months ?? [month];
  const tag =
    category === null && typeof tagParam === 'string' && transactions.some((transaction) => transaction.tags.includes(tagParam)) ? tagParam : null;
  const span = financesSpan(spanParam);
  const query = category === null && tag === null ? financesQuery(queryParam) : null;
  const listed = listedTransactions(transactions, {
    categories,
    accounts,
    months: periodMonths,
    category,
    tag,
    span,
    max: limits.financeListMax,
    refunds,
    refunded,
    interest,
    uncounted,
    selected: selectedTransaction?.id ?? null,
    query,
  });
  const periodLabel = period === 'year' ? yearOf(month) : monthLabel(month);
  const view = financesView(viewParam);
  // The movements a line opens in place: the period's counted movements,
  // the fields a row prints, each line's newest few (ADR 0052).
  const movements = lineMovements(transactions, categories, {
    months: periodMonths,
    lines: movementLines(flows),
    max: limits.financeListMax,
    refunds,
    refunded,
    interest,
  });
  // The columns, only where they are drawn (ADR 0053).
  /** @type {import('@/components/FinanceFlows.js').ChartColumns | null} */
  const columns =
    view !== 'columns'
      ? null
      : period === 'year'
        ? { kind: 'months', months: yearColumns(transactions, categories, yearOf(month), months, refunds) }
        : { kind: 'days', ...dayColumns(transactions, categories, month, todayKey, refunds) };

  /** @type {<T extends { accountId: string, date: string }>(rows: T[]) => T[]} */
  const ofSelected = (rows) =>
    selected === null
      ? []
      : rows.filter((row) => row.accountId === selected.id).sort((a, b) => b.date.localeCompare(a.date));
  /** @type {import('@/components/finance.js').FinancesPlace} */
  const place = {
    account: selected?.id ?? null,
    month,
    period,
    view,
    category,
    tag,
    span,
    refunded,
    interest,
    uncounted,
    q: query,
    transaction: selectedTransaction?.id ?? null,
  };

  return (
    <section id="screen-finances" className="screen is-active">
      <div className="screen-grid">
        <FinanceBreakdown
          overview={overview}
          chart={worthChart(overview.history, todayKey)}
          parts={allocationAccounts(overview)}
          accounts={quietAccounts(overview.accounts, finance, { todayKey, selectedId: selected?.id ?? null })}
          archived={accounts.filter((account) => account.archivedOn !== null)}
          todayKey={todayKey}
          place={place}
          staleness={staleness}
          investments={investments}
          wide={selected === null}
        />
        {selected !== null && (
          <div className="finance-side span-5">
            <FinanceAccountDetail
              key={selected.id}
              account={selected}
              balances={ofSelected(observations)}
              trades={ofSelected(trades)}
              prices={ofSelected(prices)}
              position={earned === undefined ? null : { row: earned, since: investments.since, taxPercent: investments.taxPercent }}
              todayKey={todayKey}
              place={place}
            />
          </div>
        )}
        <div className="finance-side span-12">
          <FinanceFlows
            key={period + month}
            flows={flows}
            period={period}
            view={view}
            twelveMonths={period === 'year' ? null : yearFlows(transactions, categories, month, refunds)}
            target={profile.financeSavingsTarget}
            columns={columns}
            invested={periodInvested(trades, periodMonths)}
            averages={year === null ? null : lineAverages(year)}
            uncategorised={uncategorisedCounts(transactions, categories, periodMonths, refunds)}
            movements={movements}
            accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
            months={months}
            month={month}
            todayKey={todayKey}
            place={place}
          />
        </div>
        <div className="finance-side span-7">
          <FinanceTags
            tags={tagFlows(transactions, categories, periodMonths, refunds)}
            tagged={transactions.some((transaction) => transaction.tags.length > 0)}
            periodLabel={periodLabel}
            todayKey={todayKey}
            place={place}
          />
          <FinanceTransactions
            transactions={listed.rows}
            accounts={accounts}
            categories={categories}
            lineName={category === null ? null : lineName(category, categories)}
            tag={tag}
            more={listed.more}
            standings={listed.standings}
            refunded={listed.refunded}
            uncounted={listed.uncounted}
            interest={listed.interest}
            max={limits.financeListMax}
            periodLabel={periodLabel}
            todayKey={todayKey}
            place={place}
          />
        </div>
        <div className="finance-side span-5">
          {selectedTransaction === null ? (
            <FinanceMovementForm accounts={accounts} categories={categories} todayKey={todayKey} place={place} />
          ) : (
            <FinanceTransactionDetail
              key={selectedTransaction.id}
              transaction={selectedTransaction}
              accounts={accounts}
              categories={categories}
              pairing={refundPanel(selectedTransaction, transactions, refunds, accounts)}
              todayKey={todayKey}
              place={place}
            />
          )}
        </div>
        <FinanceManage
          accountCount={accounts.length}
          categoryCount={categories.length}
          addAccount={<FinanceAddAccount place={place} />}
          categories={<FinanceCategories categories={categories} />}
          settings={
            <FinanceSettings
              key={(profile.financeTrackedSince ?? '') + '|' + (profile.financeSavingsTarget ?? '')}
              trackedSince={profile.financeTrackedSince}
              defaultAccountId={profile.defaultAccountId}
              savingsTarget={profile.financeSavingsTarget}
              accounts={accounts}
              todayKey={todayKey}
            />
          }
        />
      </div>
    </section>
  );
}
