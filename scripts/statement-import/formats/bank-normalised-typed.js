/**
 * A bank account's movements, normalised, with a signed amount, its
 * direction in `tipo` as well and the bank's own id for each movement. No
 * running balance. Rows usually come newest first.
 *
 * - `importo` is signed and must agree with `tipo`: `Entrata` is money in, a
 *   positive amount; `Uscita` money out, a negative one (`Uscita,-600`). A
 *   row where they disagree -- a positive `Uscita` included, which could be
 *   an unsigned export or a refund mislabelled -- a zero, or any other
 *   `tipo` blocks rather than guess a sign.
 * - `id_movimento` is the bank's id, and so the stable id; a row without one
 *   falls back to the hash every other format uses.
 * - The description is `descrizione_breve`, else `descrizione`. The
 *   counterparty, the bank's own category and the long text are kept in the
 *   detail for categorising.
 */

import { detailOf, parseDay, readAmount } from './common.js';

const HEADER = Object.freeze([
  'data_operazione', 'data_valuta', 'tipo', 'importo', 'valuta', 'controparte', 'categoria', 'descrizione_breve', 'descrizione',
  'id_movimento',
]);

/** @type {Record<string, 1 | -1>} */
const SIGN = { Entrata: 1, Uscita: -1 };

/** @type {import('./common.js').StatementFormat} */
export const bankNormalisedTyped = {
  id: 'bank-normalised-typed',
  label: "a bank account statement, normalised, signed amounts typed Entrata/Uscita, the bank's movement id, no running balance",
  header: HEADER,
  runningBalance: false,
  mainProduct: null,
  parse(raw) {
    /** @type {import('./common.js').ParseResult} */
    const result = { rows: [], skipped: [], problems: [] };
    for (const { line, values } of raw) {
      const type = values.tipo.trim();
      const sign = SIGN[type];
      const date = parseDay(values.data_operazione);
      const amount = readAmount(values.importo);
      const reason =
        sign === undefined ? 'tipo "' + type + '" is neither Entrata nor Uscita: its sign is unknown' :
        date === null ? 'data_operazione "' + values.data_operazione + '" is not YYYY-MM-DD' :
        amount === null ? 'importo "' + values.importo + '" is not a number' :
        amount === 0 ? 'importo is zero: nothing moved' :
        Math.sign(amount) !== sign
          ? 'importo "' + values.importo + '" disagrees with tipo ' + type + ' (' + (sign > 0 ? 'Entrata is positive' : 'Uscita is negative') + ')'
          : null;
      if (reason !== null || sign === undefined || date === null || amount === null) {
        result.problems.push({ line, reason: reason ?? 'unreadable' });
        continue;
      }
      const short = values.descrizione_breve.trim();
      const text = values.descrizione.trim();
      const bankId = values.id_movimento.trim();
      result.rows.push({
        line,
        product: null,
        date,
        when: date,
        amount,
        fee: 0,
        currency: values.valuta.trim(),
        description: short || text,
        identity: type + '|' + (short || text),
        bankId: bankId === '' ? null : bankId,
        balanceAfter: null,
        balanceWhen: date,
        detail: detailOf({
          type,
          counterparty: values.controparte,
          category: values.categoria,
          fullText: text,
          valueDate: values.data_valuta,
        }),
      });
    }
    return result;
  },
};
