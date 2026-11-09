/**
 * An invented DEGIRO transactions export for the import's tests. Every
 * ISIN, name, amount and date here is made up -- the repository is public,
 * and the real export is personal. The columns, the Italian headers, the
 * decimal commas, the `DD-MM-YYYY` dates, a wrapped product name on a row of
 * its own and newest-first order are the real file's shape.
 */

export const HEADER =
  'Data,Ora,Prodotto,ISIN,Borsa di riferimento,Borsa,Quantità,Quotazione,,Valore locale,,Valore EUR,Tasso di cambio,Commissione AutoFX,Costi di transazione e/o di terze parti EUR,Totale EUR,ID Ordine';

export const ALPHA = 'IE00AAAAAAA1';
export const US_STOCK = 'US00BBBBBBB2';
export const OLD_FUND = 'LU00CCCCCCC3';
export const NEW_FUND = 'LU00DDDDDDD4';
export const DELISTED = 'IT00EEEEEEE5';
export const FREEBIE = 'IT00FFFFFFF6';

/**
 * One data row as DEGIRO writes it.
 *
 * @param {{ date: string, name?: string, isin: string, qty: string, value: string, fx?: string, cost?: string, id?: string, currency?: string, local?: string }} r
 */
export function row(r) {
  const currency = r.currency ?? 'EUR';
  const name = r.name ?? 'Invented ' + r.isin;
  return [
    r.date, '10:30', JSON.stringify(name), r.isin, 'MIL', 'MTAA', r.qty, '"1,0000"', currency, JSON.stringify(r.local ?? r.value), currency,
    JSON.stringify(r.value), '"1,0000"', JSON.stringify(r.fx ?? '0,00'), r.cost === undefined ? '' : JSON.stringify(r.cost),
    JSON.stringify(r.value), r.id ?? '',
  ].join(',');
}

/** A wrapped product name: a row with nothing but a product. */
export const continuation = (/** @type {string} */ text) => ',,' + JSON.stringify(text) + ',,,,,,,,,,,,,,';

/** @param {string[]} lines newest first, like the file */
export const csv = (lines) => [HEADER, ...lines].join('\n') + '\n';

/** The whole invented history, newest first. */
export function history() {
  return csv([
    // the delisting: closed by DEGIRO at zero value
    row({ date: '02-09-2024', isin: DELISTED, qty: '-100', value: '0,00' }),
    // the new fund is sold, with an order id
    row({ date: '01-08-2024', isin: NEW_FUND, qty: '-20', value: '950,00', cost: '-2,00', id: 'ord-0007' }),
    // the merger: old fund out, new fund in, at the reported values, no order id
    row({ date: '03-06-2024', isin: NEW_FUND, qty: '20', value: '-900,00' }),
    row({ date: '03-06-2024', isin: OLD_FUND, qty: '-20', value: '900,00' }),
    // the handover to Scalable: a sell without an order id, and its bookkeeping rows
    row({ date: '20-05-2024', isin: ALPHA, qty: '-15', value: '1700,00' }),
    row({ date: '20-05-2024', isin: ALPHA, qty: '-15', value: '0,00', id: 'ord-0100' }),
    row({ date: '20-05-2024', isin: ALPHA, qty: '15', value: '0,00', id: 'ord-0101' }),
    // a change of exchange: sell and buy of the same units on one day
    row({ date: '02-04-2024', isin: OLD_FUND, qty: '-20', value: '800,00' }),
    row({ date: '02-04-2024', isin: OLD_FUND, qty: '20', value: '-805,00' }),
    // zero-value rows on two different days that net to zero over the holding
    row({ date: '01-04-2024', isin: FREEBIE, qty: '-5', value: '0,00' }),
    row({ date: '01-03-2024', isin: FREEBIE, qty: '5', value: '0,00' }),
    row({ date: '10-03-2024', isin: ALPHA, qty: '5', value: '-550,00', fx: '-0,10', cost: '-1,00', id: 'ord-0002' }),
    // the US stock: the EUR value is the truth, the local one is USD
    row({ date: '01-02-2024', name: 'Invented Wrapped', isin: US_STOCK, qty: '-2', value: '350,00', local: '380,00', currency: 'USD', fx: '-0,20', cost: '-1,00', id: 'ord-0004' }),
    continuation('Product Name'),
    row({ date: '05-02-2024', isin: DELISTED, qty: '100', value: '-200,00', cost: '-1,00', id: 'ord-0005' }),
    row({ date: '01-02-2024', isin: OLD_FUND, qty: '20', value: '-780,00', cost: '-1,00', id: 'ord-0006' }),
    row({ date: '20-01-2024', name: 'Invented Wrapped', isin: US_STOCK, qty: '2', value: '-300,00', local: '-330,00', currency: 'USD', fx: '-0,30', cost: '-1,00', id: 'ord-0003' }),
    continuation('Product Name'),
    row({ date: '15-01-2024', isin: ALPHA, qty: '10', value: '-1000,00', fx: '-0,50', cost: '-1,00', id: 'ord-0001' }),
  ]);
}
