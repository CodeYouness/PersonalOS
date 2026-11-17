/**
 * A bank account's movements, normalised, with a signed amount and the
 * running balance after each row. Rows usually come newest first.
 *
 * - Dated by `data_operazione`; `data_valuta` is kept in the detail.
 * - `importo` is signed, sometimes an integer (`90`). `saldo_dopo_movimento`
 *   is the balance after the row, with float noise a spreadsheet left in it
 *   (`1011.5899999999999`, or `-4.547473508864641e-13` for a zero), rounded
 *   to the cent half away from zero. Exponent notation is accepted in the
 *   balance only: an amount is what moved and stays a plain decimal.
 * - Several rows share a day and the file is newest first: on one day the
 *   rows are read bottom up, and the direction whose balances follow the
 *   rows wins (plan.js, chronological).
 * - `causale`, the bank's movement type, is kept in the detail for
 *   categorising; the description is `descrizione`, else the `causale`.
 */

import { detailOf, parseDay, readAmount, readBalance } from './common.js';

const HEADER = Object.freeze(['data_operazione', 'data_valuta', 'importo', 'valuta', 'causale', 'descrizione', 'saldo_dopo_movimento']);

/** @type {import('./common.js').StatementFormat} */
export const bankNormalisedSigned = {
  id: 'bank-normalised-signed',
  label: 'a bank account statement, normalised, signed amounts and a running balance',
  header: HEADER,
  runningBalance: true,
  mainProduct: null,
  parse(raw) {
    /** @type {import('./common.js').ParseResult} */
    const result = { rows: [], skipped: [], problems: [] };
    for (const { line, values } of raw) {
      const date = parseDay(values.data_operazione);
      const amount = readAmount(values.importo);
      const balance = readBalance(values.saldo_dopo_movimento);
      const reason =
        date === null ? 'data_operazione "' + values.data_operazione + '" is not YYYY-MM-DD' :
        amount === null ? 'importo "' + values.importo + '" is not a number' :
        balance === null && values.saldo_dopo_movimento.trim() !== '' ? 'saldo_dopo_movimento "' + values.saldo_dopo_movimento + '" is not a number' :
        null;
      if (reason !== null || date === null || amount === null) {
        result.problems.push({ line, reason: reason ?? 'unreadable' });
        continue;
      }
      const causale = values.causale.trim();
      const text = values.descrizione.trim();
      result.rows.push({
        line,
        product: null,
        date,
        when: date,
        amount,
        fee: 0,
        currency: values.valuta.trim(),
        description: text || causale,
        identity: causale + '|' + text,
        bankId: null,
        balanceAfter: balance,
        balanceWhen: date,
        detail: detailOf({ type: causale, valueDate: values.data_valuta }),
      });
    }
    return result;
  },
};
