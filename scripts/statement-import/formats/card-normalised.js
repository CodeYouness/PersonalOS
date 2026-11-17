/**
 * A card's transaction list, already normalised into Italian column names.
 * No running balance.
 *
 * - `importo` is always positive; `tipo` gives the sign: `Addebito` is money
 *   out, `Rimborso` money in. An authorisation (`Autorizzazione (in
 *   sospeso)`) and its release (`Sblocco autorizzazione`) are not movements.
 *   Any other `tipo` blocks: guessing a sign is the one thing an importer
 *   must not do.
 * - Only `stato` `Completata` is imported; any other state is skipped with
 *   the state as the reason.
 * - The description is `nome_pulito`, else `commerciante`. The stable id
 *   hashes `commerciante`, the merchant as the card network sent it, so a
 *   better cleaned-up name in a later export does not make a new movement.
 * - `commissione_estero` (a foreign-exchange fee) and `cashback` are not
 *   applied: with no running balance nothing says whether `importo` already
 *   includes the fee, or how the cashback is paid. The amount is imported as
 *   given, both are kept in the detail, and the report prints their totals.
 */

import { detailOf, parseLocalTimestamp, readAmount } from './common.js';

const HEADER = Object.freeze([
  'data_ora', 'commerciante', 'nome_pulito', 'importo', 'valuta', 'tipo', 'stato', 'categoria', 'sottocategoria',
  'commissione_estero', 'cashback',
]);

/** @type {Record<string, 1 | -1>} */
const SIGN = { Addebito: -1, Rimborso: 1 };

/** @type {Record<string, string>} */
const NOT_A_MOVEMENT = {
  'Autorizzazione (in sospeso)': 'pending authorisation',
  'Sblocco autorizzazione': 'authorisation released',
};

const COMPLETED = 'Completata';

/** @type {import('./common.js').StatementFormat} */
export const cardNormalised = {
  id: 'card-normalised',
  label: 'a card transaction list, normalised (positive amounts, sign from tipo), no running balance',
  header: HEADER,
  runningBalance: false,
  mainProduct: null,
  parse(raw) {
    /** @type {import('./common.js').ParseResult} */
    const result = { rows: [], skipped: [], problems: [] };
    for (const { line, values } of raw) {
      const type = values.tipo.trim();
      if (type in NOT_A_MOVEMENT) {
        result.skipped.push({ line, reason: NOT_A_MOVEMENT[type] });
        continue;
      }
      const sign = SIGN[type];
      if (sign === undefined) {
        result.problems.push({ line, reason: 'tipo "' + type + '" is neither Addebito nor Rimborso: its sign is unknown' });
        continue;
      }
      const state = values.stato.trim();
      if (state !== COMPLETED) {
        result.skipped.push({ line, reason: 'not completed: ' + (state === '' ? '(no state)' : state) });
        continue;
      }
      const at = parseLocalTimestamp(values.data_ora);
      const amount = readAmount(values.importo);
      const fxFee = readAmount(values.commissione_estero, 0);
      const cashback = readAmount(values.cashback, 0);
      const reason =
        at === null ? 'data_ora "' + values.data_ora + '" is not YYYY-MM-DD HH:MM:SS' :
        amount === null || amount < 0 ? 'importo "' + values.importo + '" is not a positive number' :
        fxFee === null ? 'commissione_estero "' + values.commissione_estero + '" is not a number' :
        cashback === null ? 'cashback "' + values.cashback + '" is not a number' :
        null;
      if (reason !== null || at === null || amount === null) {
        result.problems.push({ line, reason: reason ?? 'unreadable' });
        continue;
      }
      const merchant = values.commerciante.trim();
      result.rows.push({
        line,
        product: null,
        date: at.date,
        when: at.when,
        amount: sign * amount,
        fee: 0,
        currency: values.valuta.trim(),
        description: values.nome_pulito.trim() || merchant,
        identity: type + '|' + merchant,
        bankId: null,
        balanceAfter: null,
        balanceWhen: at.when,
        detail: detailOf({
          type,
          merchant,
          category: values.categoria,
          subcategory: values.sottocategoria,
          // Kept as the minor units read, so the next step needs no parsing.
          fxFee: fxFee ? String(fxFee) : '',
          cashback: cashback ? String(cashback) : '',
        }),
      });
    }
    return result;
  },
};

/**
 * The totals of the two columns the import does not apply, over the rows it
 * imports, in minor units.
 *
 * @param {import('./common.js').StatementRow[]} rows
 * @returns {{ fxFee: number, cashback: number }}
 */
export function unappliedTotals(rows) {
  let fxFee = 0;
  let cashback = 0;
  for (const row of rows) {
    fxFee += Number(row.detail.fxFee ?? 0);
    cashback += Number(row.detail.cashback ?? 0);
  }
  return { fxFee, cashback };
}
