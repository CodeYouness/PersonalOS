/**
 * A made-up hand-kept ledger in the three CSV files the ledger import reads,
 * built by the tests themselves: every account, category, note and amount
 * here is invented, and no row belongs to anyone. The repository is public.
 *
 * Not collected on its own -- vitest only picks up *.test.js.
 */

import { csv } from './statement-fixture.js';

export const MOVEMENTS_HEADER = Object.freeze([
  'id', 'data', 'inserito_il', 'tipo', 'categoria', 'emoji', 'sottocategoria', 'importo', 'importo_con_segno', 'conto_uscita',
  'conto_entrata', 'note', 'progetto_tag', 'ricorrente', 'conteggiato_in_entrate_uscite',
]);
export const CATEGORIES_HEADER = Object.freeze(['categoria', 'emoji', 'sottocategoria', 'ricorrente', 'n_movimenti']);
export const ACCOUNTS_HEADER = Object.freeze(['conto', 'tipo', 'saldo_iniziale_inserito', 'saldo_attuale_dashboard', 'n_movimenti']);

/**
 * @typedef {object} Move
 * @property {string} id
 * @property {string} data
 * @property {'uscita' | 'entrata' | 'trasferimento' | 'investimento' | 'saldo_iniziale'} tipo
 * @property {string} importo a dot decimal, positive
 * @property {string} [categoria]
 * @property {string} [sottocategoria]
 * @property {string} [da] conto_uscita
 * @property {string} [a] conto_entrata
 * @property {string} [note]
 * @property {string} [tag]
 * @property {string} [ricorrente]
 * @property {string} [conteggiato] si or no; by default si for uscita and entrata, no otherwise
 */

/** The category a type is filed in when a test does not say. */
const DEFAULT_PAIR = Object.freeze({
  uscita: ['Spesa', 'Supermercato'],
  entrata: ['Entrate', 'Stipendio'],
  trasferimento: ['Trasferimenti', 'Giroconto'],
  investimento: ['Investimenti', 'Versamento broker'],
  saldo_iniziale: ['Saldo iniziale', 'Saldo iniziale'],
});

/**
 * @param {Move} move
 * @returns {string[]}
 */
export function moveRow(move) {
  const [categoria, sottocategoria] = [move.categoria ?? DEFAULT_PAIR[move.tipo][0], move.sottocategoria ?? DEFAULT_PAIR[move.tipo][1]];
  const sign = move.tipo === 'entrata' || move.tipo === 'saldo_iniziale' ? '' : move.tipo === 'trasferimento' ? null : '-';
  const counted = move.conteggiato ?? (move.tipo === 'uscita' || move.tipo === 'entrata' ? 'si' : 'no');
  return [
    move.id, move.data, move.data + 'T12:00:00.000Z', move.tipo, categoria, '', sottocategoria, move.importo,
    sign === null ? '' : sign + move.importo, move.da ?? '', move.a ?? '', move.note ?? '', move.tag ?? '', move.ricorrente ?? '', counted,
  ];
}

/**
 * The three files of a ledger: the movements, a categories file holding
 * every pair the movements use plus `extraCategories`, and an accounts file
 * listing every account the movements name.
 *
 * @param {Move[]} moves
 * @param {{ extraCategories?: string[][], recurring?: string[], accounts?: string[][] }} [options]
 * @returns {{ movements: string, categories: string, accounts: string }}
 */
export function ledger(moves, { extraCategories = [], recurring = [], accounts } = {}) {
  const rows = moves.map(moveRow);
  /** @type {Map<string, string[]>} */
  const pairs = new Map();
  for (const row of rows) {
    const key = row[4] + '>' + row[6];
    const count = rows.filter((other) => other[4] === row[4] && other[6] === row[6]).length;
    pairs.set(key, [row[4], '', row[6], recurring.includes(key) ? 'Sì' : 'No', String(count)]);
  }
  for (const [categoria, sottocategoria] of extraCategories) pairs.set(categoria + '>' + sottocategoria, [categoria, '', sottocategoria, 'No', '0']);
  const names = [...new Set(rows.flatMap((row) => [row[9], row[10]]).filter((name) => name !== ''))];
  return {
    movements: csv(MOVEMENTS_HEADER, rows, { bom: true }),
    categories: csv(CATEGORIES_HEADER, [...pairs.values()]),
    accounts: csv(ACCOUNTS_HEADER, accounts ?? names.map((name) => [name, 'banca', '', '', '0'])),
  };
}
