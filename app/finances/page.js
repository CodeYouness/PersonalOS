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
import { financesSpan, financesView } from '@/lib/domain/addresses.js';
import { isMonthKey, monthOf, today, yearOf } from '@/lib/domain/dates.js';
import {
  calendarYearFlows,
  financeOverview,
  flowMonths,
  flowTrend,
  lineAverages,
  lineMovements,
  listedTransactions,
  monthFlows,
  monthsWith,
  movementLines,
  periodInvested,
  quietAccounts,
  savingsRate,
  tagFlows,
  trendMonths,
  uncategorisedCounts,
  worthChart,
  yearFlows,
} from '@/lib/domain/derive/finance.js';
import { investmentReturns } from '@/lib/domain/derive/investments.js';
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
 * -- a category, or Uncategorised spending or income -- and lists that
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
 * `?view=table` shows the section as a table with its comparison columns,
 * where a subcategory -- or a line without any -- opens its movements of the
 * period in place (lineMovements, handed only to the table view); anything
 * else, or nothing, shows the circle of the period with its totals and the
 * rest of the summary, and no table (ADR 0050). What the circle calls
 * invested is read from the trades of the period (periodInvested), never
 * from a transaction. A movement counted over several months (ADR 0052) is
 * read in each of them by every flow, and listed by its date.
 *
 * The section's trend draws income and spending as bars over the trend's
 * twelve months in a month and the year's in a year. An old `?chart=` from
 * before ADR 0048 is read by nothing.
 *
 * `?tag=<tag>` selects a tag of the By tag card (ADR 0046) -- one that a
 * movement carries, else nothing -- and lists the period's movements it
 * counts, or, with `?span=all`, all of them. One selection at a time: with
 * a line selected too (an address typed by hand), the line wins. A month or
 * a year with nothing selected lists only its newest `limits.financeListMax`
 * movements, says how many more, and `?span=all` lists them all (ADR 0048).
 *
 * Each savings rate is set against the target savings rate, when one is set
 * in Settings, under Manage (ADR 0045).
 *
 * What the holdings earned (investmentReturns, ADR 0051) is read once: the
 * Net worth card's Invested section and Investments fold show all of them,
 * and a selected holding's panel shows its own.
 *
 * @param {{ searchParams: Promise<{ account?: string | string[], month?: string | string[], period?: string | string[], view?: string | string[], transaction?: string | string[], category?: string | string[], tag?: string | string[], span?: string | string[] }> }} props
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
  const year = period === 'year' ? calendarYearFlows(transactions, categories, month, months) : null;
  const flows = year ?? monthFlows(transactions, categories, month);
  const periodMonths = year?.months ?? [month];
  const trendShown = year === null ? trendMonths(months, month) : periodMonths;
  const tag =
    category === null && typeof tagParam === 'string' && transactions.some((transaction) => transaction.tags.includes(tagParam)) ? tagParam : null;
  const span = financesSpan(spanParam);
  const listed = listedTransactions(transactions, {
    categories,
    months: periodMonths,
    category,
    tag,
    span,
    max: limits.financeListMax,
  });
  const periodLabel = period === 'year' ? yearOf(month) : monthLabel(month);
  const view = financesView(viewParam);
  // The movements a line opens in place, only where they are shown: the
  // table view. The period's counted movements, the fields a row prints,
  // each line's newest few (ADR 0052).
  const movements =
    view === 'table' ? lineMovements(transactions, categories, { months: periodMonths, lines: movementLines(flows), max: limits.financeListMax }) : null;

  /** @type {<T extends { accountId: string, date: string }>(rows: T[]) => T[]} */
  const ofSelected = (rows) =>
    selected === null
      ? []
      : rows.filter((row) => row.accountId === selected.id).sort((a, b) => b.date.localeCompare(a.date));
  /** @type {import('@/components/finance.js').FinancesPlace} */
  const place = { account: selected?.id ?? null, month, period, view, category, tag, span, transaction: selectedTransaction?.id ?? null };

  return (
    <section id="screen-finances" className="screen is-active">
      <div className="screen-grid">
        <FinanceBreakdown
          overview={overview}
          chart={worthChart(overview.history, todayKey)}
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
            yearRate={period === 'year' ? null : savingsRate(yearFlows(transactions, categories, month))}
            target={profile.financeSavingsTarget}
            trend={flowTrend(transactions, categories, trendShown)}
            invested={periodInvested(trades, periodMonths)}
            averages={year === null ? null : lineAverages(year)}
            uncategorised={uncategorisedCounts(transactions, categories, periodMonths)}
            movements={movements}
            months={months}
            month={month}
            todayKey={todayKey}
            place={place}
          />
        </div>
        <div className="finance-side span-7">
          <FinanceTags
            tags={tagFlows(transactions, categories, periodMonths)}
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
