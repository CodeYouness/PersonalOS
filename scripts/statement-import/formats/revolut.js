/**
 * Revolut's own export, in Italian. Each `Prodotto` is an account of its own
 * (`Attuale` the current account, `Risparmi`, `Deposito`): its `Saldo` is that
 * product's balance after the row.
 *
 * - Imported: `State` `COMPLETATO`. `OPERAZIONE ANNULLATA` is skipped as
 *   cancelled, any other state with the state as the reason.
 * - Dated by the day of `Data di inizio`, the local time the bank shows: a
 *   card payment starts one day and may complete the next, and the day it
 *   started is the day it was spent. `Data di completamento` is kept in the
 *   detail.
 * - `Saldo` follows completion, not start: it is the product's balance after
 *   the row was booked, in the order of `Data di completamento` (the file's
 *   own order). A payment started on day 1 that completes on day 2 after
 *   other rows sits in the chain where it completed. So the running balance
 *   -- the chain, the opening balance and the check -- is walked in
 *   completion order, while the movement keeps the day it started; the
 *   opening balance is dated before the earliest of those days, so it plus
 *   every movement is still the last `Saldo`.
 * - `Importo` is the signed amount; `Costo`, never negative, is a fee charged
 *   on the row (a currency exchange's fee, the tax withheld on interest). The
 *   fee is a movement of its own, `-Costo`, beside the amount: it is a
 *   different thing from what it was charged on -- interest is income, the
 *   tax on it is not -- so categorising each needs each. `Saldo` is after
 *   both.
 */

import { detailOf, parseLocalTimestamp, readAmount, readBalance } from './common.js';

const HEADER = Object.freeze([
  'Tipo', 'Prodotto', 'Data di inizio', 'Data di completamento', 'Descrizione', 'Importo', 'Costo', 'Valuta', 'State', 'Saldo',
]);

const COMPLETED = 'COMPLETATO';
const CANCELLED = 'OPERAZIONE ANNULLATA';

/** @type {import('./common.js').StatementFormat} */
export const revolut = {
  id: 'revolut',
  label: 'Revolut export (Italian), one account per product, running balance per product',
  header: HEADER,
  runningBalance: true,
  mainProduct: 'Attuale',
  parse(raw) {
    /** @type {import('./common.js').ParseResult} */
    const result = { rows: [], skipped: [], problems: [] };
    for (const { line, values } of raw) {
      const state = values.State.trim();
      if (state === CANCELLED) {
        result.skipped.push({ line, reason: 'cancelled' });
        continue;
      }
      if (state !== COMPLETED) {
        result.skipped.push({ line, reason: 'not completed: ' + (state === '' ? '(no state)' : state) });
        continue;
      }
      const currency = values.Valuta.trim();
      const started = parseLocalTimestamp(values['Data di inizio']);
      const amount = readAmount(values.Importo);
      const fee = readAmount(values.Costo, 0);
      const balance = readBalance(values.Saldo);
      const completedText = values['Data di completamento'].trim();
      const completed = completedText === '' ? started : parseLocalTimestamp(completedText);
      const product = values.Prodotto.trim();
      const reason =
        product === '' ? 'no Prodotto' :
        started === null ? 'Data di inizio "' + values['Data di inizio'] + '" is not YYYY-MM-DD HH:MM:SS' :
        completed === null ? 'Data di completamento "' + completedText + '" is not YYYY-MM-DD HH:MM:SS' :
        amount === null ? 'Importo "' + values.Importo + '" is not a number' :
        fee === null || fee < 0 ? 'Costo "' + values.Costo + '" is not a fee (a number, not negative)' :
        balance === null && values.Saldo.trim() !== '' ? 'Saldo "' + values.Saldo + '" is not a number' :
        null;
      if (reason !== null || started === null || completed === null || amount === null || fee === null) {
        result.problems.push({ line, reason: reason ?? 'unreadable' });
        continue;
      }
      result.rows.push({
        line,
        product,
        date: started.date,
        when: started.when,
        amount,
        fee,
        currency,
        description: values.Descrizione.trim(),
        identity: values.Tipo.trim() + '|' + values.Descrizione.trim(),
        bankId: null,
        balanceAfter: balance,
        balanceWhen: completed.when,
        detail: detailOf({ type: values.Tipo, product, completedAt: values['Data di completamento'] }),
      });
    }
    return result;
  },
};
