/**
 * A made-up finance spreadsheet in the real layout (#139), built by the
 * tests themselves so no personal data enters the repository. The tab and
 * column names are the template's, generic; every account, category and
 * amount here is invented.
 *
 * Not collected on its own -- vitest only picks up *.test.js.
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import writeXlsxFile from 'write-excel-file/node';

const HEADERS = [
  'Timestamp', 'Informazioni cronologiche', 'Categoria', 'Sottocategoria', 'Importo', 'Note',
  'Da', 'A', 'Tracciamento in Entrate/Uscite', 'Tag',
];

/**
 * @typedef {object} Movement
 * @property {string} at ISO instant of the form's Timestamp
 * @property {string} date day key
 * @property {string} [category]
 * @property {string} [subcategory]
 * @property {number} amount euros
 * @property {string} [note]
 * @property {string} [from]
 * @property {string} [to]
 * @property {boolean} [counted]
 * @property {string} [tags]
 */

/** @param {string} dayKey */
const day = (dayKey) => ({ value: new Date(dayKey + 'T00:00:00.000Z'), type: Date, format: 'dd/mm/yyyy' });

/** The movements, deliberately not in date order. */
export const MOVEMENTS = /** @type {Movement[]} */ ([
  { at: '2024-01-27T18:00:00.000Z', date: '2024-01-27', category: 'Stipendio', subcategory: 'Stipendio', amount: 2500, to: 'Conto' },
  { at: '2024-01-01T09:00:00.000Z', date: '2024-01-01', category: 'Saldo', subcategory: 'Iniziale', amount: 1000, to: 'Conto', counted: false, tags: 'saldo iniziale' },
  { at: '2024-01-01T09:01:00.000Z', date: '2024-01-01', category: 'Saldo', subcategory: 'Iniziale', amount: 4000, to: 'Risparmi', counted: false, tags: 'saldo iniziale' },
  { at: '2024-01-01T09:02:00.000Z', date: '2024-01-01', category: 'Saldo', subcategory: 'Iniziale', amount: 1000, to: 'Risparmi', counted: false, tags: 'saldo iniziale' },
  { at: '2024-01-03T08:00:00.000Z', date: '2024-01-03', category: 'Casa', subcategory: 'Affitto', amount: 800, from: 'Conto' },
  { at: '2024-01-05T12:30:00.000Z', date: '2024-01-05', category: 'Cibo', subcategory: 'Spesa', amount: 18.4, note: 'Supermarket', from: 'Carta', tags: 'casa, weekend' },
  { at: '2024-01-28T10:00:00.000Z', date: '2024-01-28', category: 'Trasferimento', subcategory: '', amount: 300, from: 'Conto', to: 'Risparmi' },
  { at: '2024-01-15T10:00:00.000Z', date: '2024-01-15', category: 'Investimenti', subcategory: 'ETF', amount: 250, from: 'Conto' },
  { at: '2024-01-20T10:00:00.000Z', date: '2024-01-20', category: 'Rimborsi', subcategory: 'Rimborso', amount: 30, note: 'Shoes back', to: 'Carta' },
  { at: '2024-01-22T10:00:00.000Z', date: '2024-01-22', category: 'Regali', subcategory: 'Regalo', amount: 50, note: 'A gift', to: 'Conto', counted: false },
  { at: '2024-01-10T10:00:00.000Z', date: '2024-01-10', category: 'Cibo', subcategory: 'Spesa', amount: 0, from: 'Contanti' },
  { at: '2024-01-11T10:00:00.000Z', date: '2024-01-11', category: 'Cibo', subcategory: 'Spesa', amount: 12 },
]);

/** The trades log: the purchase above, and one from before tracking. */
export const TRADES = [
  { date: '2024-01-16', ticker: 'WRLD', quantity: 2.5, price: 100, fee: 0 },
  { date: '2023-06-01', ticker: 'WRLD', quantity: 1, price: 90, fee: 1.5 },
];

/** A mapping that resolves every row above. */
export function mapping() {
  return {
    accounts: {
      Conto: { name: 'Current account', kind: 'cash' },
      Carta: { name: 'Card', kind: 'cash' },
      Contanti: { name: 'Cash', kind: 'cash' },
      Risparmi: { name: 'Savings', kind: 'cash' },
      Broker: { name: 'World ETF', kind: 'investment', valuation: 'units' },
    },
    holdings: { WRLD: 'Broker' },
    categories: [
      { name: 'Home', kind: 'expense' },
      { name: 'Rent', parent: 'Home', fixedCost: true },
      { name: 'Food', kind: 'expense' },
      { name: 'Groceries', parent: 'Food' },
      { name: 'Shopping', kind: 'expense' },
      { name: 'Work', kind: 'income' },
      { name: 'Salary', parent: 'Work' },
      { name: 'Gifts', kind: 'income' },
    ],
    pairs: {
      'Casa|Affitto': 'Home/Rent',
      'Cibo|Spesa': 'Food/Groceries',
      'Stipendio|Stipendio': 'Work/Salary',
      'Investimenti|ETF': 'investment',
      'Rimborsi|Rimborso': 'refund',
      'Regali|Regalo': 'Gifts',
    },
    openingBalanceTag: 'saldo iniziale',
    refundFallback: 'Shopping',
    tags: { casa: null, weekend: 'weekends' },
    defaultAccount: 'Conto',
    rows: {},
  };
}

/**
 * Writes the workbook and the mapping into a directory.
 *
 * @param {string} directory
 * @param {{ movements?: Movement[], trades?: typeof TRADES, mapping?: unknown }} [options]
 * @returns {Promise<{ xlsxPath: string, mappingPath: string }>}
 */
export async function writeSheet(directory, options = {}) {
  const movements = options.movements ?? MOVEMENTS;
  const trades = options.trades ?? TRADES;
  const xlsxPath = path.join(directory, 'download.xlsx');
  const mappingPath = path.join(directory, 'mapping.json');
  await writeXlsxFile(
    [
      {
        // An xlsx cannot hold "/" in a sheet name; the reader ignores punctuation.
        sheet: 'Log Entrate Uscite',
        data: [
          HEADERS,
          ...movements.map((row) => [
            { value: new Date(row.at), type: Date, format: 'dd/mm/yyyy hh:mm:ss' },
            day(row.date),
            row.category ?? '',
            row.subcategory ?? '',
            row.amount,
            row.note ?? '',
            row.from ?? '',
            row.to ?? '',
            row.counted === false ? 'No' : 'Sì',
            row.tags ?? '',
          ]),
          // Reading stops at the first row with no date; this one is past it.
          [null, null, null, null, null, null, null, null, null, null],
          [{ value: new Date('2024-02-01T10:00:00.000Z'), type: Date, format: 'dd/mm/yyyy hh:mm:ss' }, day('2024-02-01'), 'Cibo', 'Spesa', 99, '', 'Carta', '', 'Sì', ''],
        ],
      },
      {
        sheet: 'Log Transazioni',
        data: [
          ['Portafoglio'],
          ['Data', 'Ticker', 'Quantità', "Prezzo d'acquisto", 'Commissioni'],
          ...trades.map((row) => [day(row.date), row.ticker, row.quantity, row.price, row.fee ?? null]),
        ],
      },
    ]
  ).toFile(xlsxPath);
  await writeFile(mappingPath, JSON.stringify(options.mapping ?? mapping(), null, 2));
  return { xlsxPath, mappingPath };
}
