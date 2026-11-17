/**
 * Made-up statements in the four formats the statement import reads, built
 * by the tests themselves: every merchant, description and amount here is
 * invented, and no row belongs to anyone. The repository is public.
 *
 * Not collected on its own -- vitest only picks up *.test.js.
 */

/**
 * One CSV field, quoted when it holds a comma, a quote or a line break, its
 * quotes doubled (RFC 4180).
 *
 * @param {string} value
 */
function field(value) {
  return /[",\r\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
}

/**
 * @param {readonly string[]} header
 * @param {readonly (readonly string[])[]} rows
 * @param {{ bom?: boolean, eol?: string, trailing?: boolean }} [options]
 */
export function csv(header, rows, { bom = false, eol = '\n', trailing = true } = {}) {
  const text = [header, ...rows].map((row) => row.map(field).join(',')).join(eol) + (trailing ? eol : '');
  return (bom ? '\uFEFF' : '') + text;
}

export const REVOLUT_HEADER = Object.freeze([
  'Tipo', 'Prodotto', 'Data di inizio', 'Data di completamento', 'Descrizione', 'Importo', 'Costo', 'Valuta', 'State', 'Saldo',
]);
export const CARD_HEADER = Object.freeze([
  'data_ora', 'commerciante', 'nome_pulito', 'importo', 'valuta', 'tipo', 'stato', 'categoria', 'sottocategoria',
  'commissione_estero', 'cashback',
]);
export const SIGNED_HEADER = Object.freeze(['data_operazione', 'data_valuta', 'importo', 'valuta', 'causale', 'descrizione', 'saldo_dopo_movimento']);
export const TYPED_HEADER = Object.freeze([
  'data_operazione', 'data_valuta', 'tipo', 'importo', 'valuta', 'controparte', 'categoria', 'descrizione_breve', 'descrizione',
  'id_movimento',
]);

/**
 * A Revolut row, completed and in EUR unless told otherwise.
 *
 * @param {{ tipo?: string, prodotto?: string, inizio: string, fine?: string, descrizione: string, importo: string, costo?: string, valuta?: string, state?: string, saldo: string }} row
 * @returns {string[]}
 */
export function revolutRow({ tipo = 'Pagamento con carta', prodotto = 'Attuale', inizio, fine, descrizione, importo, costo = '0.00', valuta = 'EUR', state = 'COMPLETATO', saldo }) {
  return [tipo, prodotto, inizio, fine ?? inizio, descrizione, importo, costo, valuta, state, saldo];
}

/**
 * A Revolut export over March and April 2026, in the bank's own order --
 * completion order -- which is not start order: the coffee started late on
 * 1 March but completed on 3 March, after the bakery and a top-up. The
 * current account (Attuale) from 200.00, with a fee on a currency exchange,
 * a cancelled payment and a pending one (no completion date) and a pocket in
 * another currency; and a savings deposit (Deposito) receiving interest with
 * tax withheld.
 *
 * Attuale, by completion: 200.00 -> 181.12 (bakery -18.88) -> 191.12 (top-up
 *   +10.00) -> 188.72 (coffee -2.40) -> 238.72 (+50.00) -> 219.32 (-19.21 -
 *   0.19) -> 221.32 (+2.00 refund). By start date the coffee would come
 *   first, and 188.72 + 2.40 = 191.12 would be read as the opening balance.
 * Deposito: 3000.00 -> 3000.12 (0.16 - 0.04)
 */
export function revolutExport() {
  return csv(REVOLUT_HEADER, [
    revolutRow({ inizio: '2026-03-02 09:01:00', descrizione: 'Bakery Uno', importo: '-18.88', saldo: '181.12' }),
    revolutRow({ tipo: 'Ricarica', inizio: '2026-03-03 08:00:00', descrizione: 'Top-up', importo: '10.00', saldo: '191.12' }),
    revolutRow({ inizio: '2026-03-01 23:50:13', fine: '2026-03-03 12:21:25', descrizione: 'Coffee Bar', importo: '-2.40', saldo: '188.72' }),
    revolutRow({ inizio: '2026-03-04 10:00:00', fine: '', descrizione: 'Shoe Shop', importo: '-60.00', state: 'OPERAZIONE ANNULLATA', saldo: '' }),
    revolutRow({ tipo: 'Ricarica', inizio: '2026-03-10 08:00:00', descrizione: 'Top-up, from "main" bank', importo: '50.00', saldo: '238.72' }),
    revolutRow({ tipo: 'Cambia valuta', inizio: '2026-04-11 19:14:02', descrizione: 'Conversione in TRY', importo: '-19.21', costo: '0.19', saldo: '219.32' }),
    revolutRow({ tipo: 'Cambia valuta', inizio: '2026-04-11 19:14:02', descrizione: 'Conversione da EUR', importo: '1000.00', valuta: 'TRY', saldo: '1000.00' }),
    revolutRow({ tipo: 'Rimborso su carta', inizio: '2026-04-12 09:00:00', descrizione: 'Coffee Bar', importo: '2.00', saldo: '221.32' }),
    revolutRow({ inizio: '2026-04-13 09:00:00', fine: '', descrizione: 'Book Stall', importo: '-7.00', state: 'IN SOSPESO', saldo: '' }),
    revolutRow({
      tipo: 'Interessi', prodotto: 'Deposito', inizio: '2026-04-04 04:50:11',
      descrizione: 'Interessi netti pagati nel conto "Conto deposito" in data Apr 4, 2026', importo: '0.16', costo: '0.04', saldo: '3000.12',
    }),
  ]);
}

/**
 * A card row, a completed charge unless told otherwise.
 *
 * @param {{ at: string, merchant: string, clean?: string, importo: string, tipo?: string, stato?: string, categoria?: string, sotto?: string, fx?: string, cashback?: string, valuta?: string }} row
 * @returns {string[]}
 */
export function cardRow({ at, merchant, clean = '', importo, tipo = 'Addebito', stato = 'Completata', categoria = 'Food', sotto = 'Coffee', fx = '0', cashback = '0', valuta = 'EUR' }) {
  return [at, merchant, clean, importo, valuta, tipo, stato, categoria, sotto, fx, cashback];
}

export function cardExport() {
  return csv(CARD_HEADER, [
    cardRow({ at: '2026-05-01 08:00:00', merchant: 'COFFEE*BAR 123', clean: 'Coffee Bar', importo: '2.40' }),
    cardRow({ at: '2026-05-01 08:00:00', merchant: 'COFFEE*BAR 123', clean: 'Coffee Bar', importo: '2.40' }),
    cardRow({ at: '2026-05-02 12:00:00', merchant: 'BOOKS LTD', importo: '15.00', categoria: 'Shopping', sotto: 'Books', fx: '0.30', cashback: '0.15' }),
    cardRow({ at: '2026-05-03 12:00:00', merchant: 'BOOKS LTD', importo: '5.00', tipo: 'Rimborso', categoria: 'Shopping', sotto: 'Books' }),
    cardRow({ at: '2026-05-04 12:00:00', merchant: 'HOTEL X', importo: '100.00', tipo: 'Autorizzazione (in sospeso)', stato: 'In corso' }),
    cardRow({ at: '2026-05-05 12:00:00', merchant: 'HOTEL X', importo: '100.00', tipo: 'Sblocco autorizzazione' }),
    cardRow({ at: '2026-05-06 12:00:00', merchant: 'GADGETS', importo: '30.00', stato: 'In corso' }),
    cardRow({ at: '2026-05-07 12:00:00', merchant: 'GADGETS', importo: '30.00', stato: 'Stornata' }),
    cardRow({ at: '2026-05-08 12:00:00', merchant: 'GADGETS', importo: '30.00', stato: 'Fallita' }),
  ]);
}

/**
 * A signed bank statement, newest first, the balance column with float
 * noise. From 1000.00: -0.31 fee, +90 salary, -78.10 transfer, two
 * identical -1.00 charges on one day.
 *
 * 1000.00 -> 999.69 -> 1089.69 -> 1011.59 -> 1010.59 -> 1009.59
 */
export function signedRows() {
  return [
    ['2026-06-05', '2026-06-05', '-1.00', 'EUR', 'COMMISSIONI/SPESE', 'Monthly card fee', '1009.5899999999999'],
    ['2026-06-05', '2026-06-05', '-1.00', 'EUR', 'COMMISSIONI/SPESE', 'Monthly card fee', '1010.59'],
    ['2026-06-03', '2026-06-03', '-78.10', 'EUR', 'DISPOSIZIONE DI PAGAMENTO', 'Payment to Utility Co, ref 12', '1011.5899999999999'],
    ['2026-06-02', '2026-06-01', '90', 'EUR', 'ACCREDITO EMOLUMENTI', 'Salary June', '1089.69'],
    ['2026-06-01', '2026-06-01', '-0.31', 'EUR', 'COMMISSIONI/SPESE', 'Stamp duty', '999.69'],
  ];
}

/**
 * A signed statement, newest first, with several rows a day and a balance of
 * zero written as float noise in exponent notation, as a spreadsheet leaves
 * it. From 50.00:
 *
 * 10 June: -50.00 -> 0 (-4.5e-13), +20.00 -> 20.00, -5.00 -> 15.00
 * 11 June: +100.00 -> 115.00, -15.00 -> 100.00, -100.00 -> 0 (1.1e-13)
 */
export function signedSameDayRows() {
  return [
    ['2026-06-11', '2026-06-11', '-100.00', 'EUR', 'GIROCONTO/BONIFICO', 'Transfer out', '1.1368683772161603e-13'],
    ['2026-06-11', '2026-06-11', '-15.00', 'EUR', 'DISPOSIZIONE DI PAGAMENTO', 'Payment B', '100'],
    ['2026-06-11', '2026-06-11', '100', 'EUR', 'VERSAMENTO CONTANTE/ASSEGNI', 'Cash deposit', '115.00'],
    ['2026-06-10', '2026-06-10', '-5.00', 'EUR', 'DISPOSIZIONE DI PAGAMENTO', 'Payment A', '15'],
    ['2026-06-10', '2026-06-10', '20.00', 'EUR', 'STORNO MOVIMENTI', 'Reversal', '20.000000000000004'],
    ['2026-06-10', '2026-06-10', '-50.00', 'EUR', 'GIROCONTO/BONIFICO', 'Transfer to savings', '-4.547473508864641e-13'],
  ];
}

export function signedExport(rows = signedRows()) {
  return csv(SIGNED_HEADER, rows);
}

export function typedRows() {
  return [
    ['2026-07-03', '2026-07-03', 'Uscita', '-12.50', 'EUR', 'Pizza Place', 'Restaurants', 'Pizza Place', 'Card payment Pizza Place 03/07', 'MOV-0003'],
    ['2026-07-02', '2026-07-02', 'Entrata', '200.00', 'EUR', 'A Friend', 'Transfers', 'Transfer from A Friend', 'Incoming transfer, reason: "dinner, tickets"', 'MOV-0002'],
    ['2026-07-01', '2026-07-01', 'Uscita', '-45.00', 'EUR', 'Grocer', 'Groceries', 'Grocer', 'Card payment Grocer 01/07', 'MOV-0001'],
  ];
}

export function typedExport(rows = typedRows()) {
  return csv(TYPED_HEADER, rows);
}
