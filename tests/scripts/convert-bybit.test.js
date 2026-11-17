/**
 * Converting a card's JSON export (Bybit's, as the user hands it over) into
 * the CSV the `card-normalised` format reads: each rule of the conversion,
 * the round trip through the real format's parse, the merchant identity
 * taken from earlier CSVs, and the command line on temporary files.
 *
 * Every merchant, card and amount here is invented. The repository is public.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { convertBybit, parseArgs } from '@/scripts/convert-bybit.js';
import { CARD_COLUMNS, convertBybitJson, readKnownRows, toCardCsv } from '@/scripts/statement-import/convert/bybit-json.js';
import { cardNormalised } from '@/scripts/statement-import/formats/card-normalised.js';
import { readStatement } from '@/scripts/statement-import/read.js';
import { CARD_HEADER, cardRow, csv } from './statement-fixture.js';

/**
 * One movement of the JSON, a successful purchase unless told otherwise.
 *
 * @param {Record<string, unknown>} [fields]
 */
function movement(fields = {}) {
  return { data: '2026-10-03 09:15:00', merchant: 'BAKERY*CORNER 42', tipo: 'Purchase', stato: 'Successful', importo_eur: -3.5, carta: '0000', ...fields };
}

/**
 * @param {unknown[]} movimenti
 * @param {Record<string, unknown>} [top]
 */
function exportOf(movimenti, top = {}) {
  return { carta: 'Test card', periodo: '2026-10', estratto_il: '2026-10-20', movimenti, ...top };
}

/** @param {unknown[]} movimenti */
const convert = (movimenti) => convertBybitJson(exportOf(movimenti), []);

describe('the conversion of each row', () => {
  it('writes a successful purchase as a completed charge at its amount, positive', () => {
    const { rows, skipped, problems } = convert([movement({ categoria: 'Food (MCC 5462)' })]);
    expect(problems).toEqual([]);
    expect(skipped).toEqual([]);
    expect(rows).toEqual([
      {
        data_ora: '2026-10-03 09:15:00',
        commerciante: 'BAKERY*CORNER 42',
        nome_pulito: '',
        importo: '3.50',
        valuta: 'EUR',
        tipo: 'Addebito',
        stato: 'Completata',
        categoria: 'Food',
        sottocategoria: '',
        commissione_estero: '0',
        cashback: '0',
      },
    ]);
  });

  it('writes a successful refund as a completed Rimborso', () => {
    const { rows } = convert([movement({ tipo: 'Refund', importo_eur: 12.4 })]);
    expect(rows.map((row) => [row.tipo, row.stato, row.importo])).toEqual([['Rimborso', 'Completata', '12.40']]);
  });

  it('refuses a tipo it does not know, never guessing its sign', () => {
    const { rows, problems } = convert([movement({ tipo: 'Cashback' })]);
    expect(rows).toEqual([]);
    expect(problems.map((problem) => problem.reason)).toEqual(['tipo "Cashback" is neither Purchase nor Refund: its sign is unknown']);
  });

  it('skips a reversed row as an annulled authorisation, whatever its sign', () => {
    const { rows, skipped, problems } = convert([
      movement({ stato: 'Reversed', importo_eur: 1.84 }),
      movement({ stato: 'Reversed', importo_eur: -1.84 }),
    ]);
    expect(rows).toEqual([]);
    expect(problems).toEqual([]);
    expect(skipped.map((skip) => skip.reason)).toEqual(['annulled authorisation', 'annulled authorisation']);
  });

  it('imports a pending row with a booked amount at the booked amount', () => {
    const { rows, problems } = convert([
      movement({ merchant: 'PUMP*FUEL 7', stato: 'In Progress', importo_eur: -150, importo_contabilizzato_eur: -41.07, categoria: 'Transport (MCC 5541)' }),
    ]);
    expect(problems).toEqual([]);
    expect(rows.map((row) => [row.commerciante, row.stato, row.importo, row.categoria])).toEqual([['PUMP*FUEL 7', 'Completata', '41.07', 'Transport']]);
  });

  it('imports a pending refund with no booked amount at its amount: it is already in the balance', () => {
    const { rows } = convert([movement({ tipo: 'Refund', stato: 'In Progress', importo_eur: 2.62 })]);
    expect(rows.map((row) => [row.tipo, row.stato, row.importo])).toEqual([['Rimborso', 'Completata', '2.62']]);
  });

  it('leaves out a pending purchase with no booked amount, saying so', () => {
    const { rows, skipped, problems } = convert([movement({ stato: 'In Progress', importo_eur: -9.99 })]);
    expect(rows).toEqual([]);
    expect(problems).toEqual([]);
    expect(skipped).toEqual([{ index: 1, at: '2026-10-03 09:15:00', merchant: 'BAKERY*CORNER 42', reason: 'pending, no booked amount' }]);
  });

  it('refuses a state it does not know', () => {
    const { problems } = convert([movement({ stato: 'Declined' })]);
    expect(problems.map((problem) => problem.reason)).toEqual(['stato "Declined" is not Successful, In Progress or Reversed']);
  });

  it('refuses an amount whose sign contradicts the tipo', () => {
    const { rows, problems } = convert([
      movement({ importo_eur: 3.5 }),
      movement({ tipo: 'Refund', importo_eur: -3.5 }),
      movement({ stato: 'In Progress', importo_eur: -50, importo_contabilizzato_eur: 10 }),
    ]);
    expect(rows).toEqual([]);
    expect(problems.map((problem) => problem.reason)).toEqual([
      'importo_eur 3.5 is not negative, as a Purchase is',
      'importo_eur -3.5 is not positive, as a Refund is',
      'importo_contabilizzato_eur 10 is not negative, as a Purchase is',
    ]);
  });

  it('refuses a zero, a missing or a non-number amount', () => {
    const { rows, problems } = convert([
      movement({ importo_eur: 0 }),
      movement({ importo_eur: undefined }),
      movement({ importo_eur: '3.50' }),
      movement({ stato: 'In Progress', importo_contabilizzato_eur: 'ten' }),
    ]);
    expect(rows).toEqual([]);
    expect(problems.map((problem) => problem.reason)).toEqual([
      'importo_eur is zero',
      'importo_eur is missing',
      'importo_eur is not a number',
      'importo_contabilizzato_eur is not a number',
    ]);
  });

  it('refuses a timestamp that is not YYYY-MM-DD HH:MM:SS', () => {
    const { problems } = convert([movement({ data: '2026-10-03T09:15:00Z' }), movement({ data: '2026-02-30 10:00:00' })]);
    expect(problems.map((problem) => problem.reason)).toEqual([
      'data "2026-10-03T09:15:00Z" is not YYYY-MM-DD HH:MM:SS',
      'data "2026-02-30 10:00:00" is not YYYY-MM-DD HH:MM:SS',
    ]);
  });

  it('refuses a booked amount that differs from the amount of a completed row', () => {
    const { problems } = convert([movement({ importo_eur: -3.5, importo_contabilizzato_eur: -4 })]);
    expect(problems.map((problem) => problem.reason)).toEqual(['Successful, yet importo_contabilizzato_eur -4 differs from importo_eur -3.5']);
    expect(convert([movement({ importo_eur: -3.5, importo_contabilizzato_eur: -3.5 })]).problems).toEqual([]);
  });
});

describe('money', () => {
  it('turns floats into minor units once and prints them with two decimals', () => {
    const { rows } = convert([
      movement({ importo_eur: -0.1 }),
      movement({ importo_eur: -0.29 }),
      movement({ importo_eur: -1.15 }),
      movement({ importo_eur: -1234.5 }),
      movement({ importo_eur: -7 }),
    ]);
    expect(rows.map((row) => row.importo)).toEqual(['0.10', '0.29', '1.15', '1234.50', '7.00']);
  });

  it('refuses an amount with more than two decimals rather than rounding it', () => {
    const { rows, problems } = convert([movement({ importo_eur: -1.005 }), movement({ stato: 'In Progress', importo_contabilizzato_eur: -2.499 })]);
    expect(rows).toEqual([]);
    expect(problems.map((problem) => problem.reason)).toEqual([
      'importo_eur -1.005 has more than two decimals',
      'importo_contabilizzato_eur -2.499 has more than two decimals',
    ]);
  });
});

describe('the category', () => {
  it("is the JSON's text without the trailing MCC, the subcategory empty", () => {
    const { rows } = convert([
      movement({ categoria: 'Shopping (MCC 5999)' }),
      movement({ categoria: 'Shopping' }),
      movement({ categoria: '(MCC 5999) Shopping' }),
      movement({}),
    ]);
    expect(rows.map((row) => [row.categoria, row.sottocategoria])).toEqual([
      ['Shopping', ''],
      ['Shopping', ''],
      ['(MCC 5999) Shopping', ''],
      ['', ''],
    ]);
  });
});

describe('untrusted input', () => {
  it('refuses a file whose movimenti is not an array', () => {
    expect(() => convertBybitJson(null, [])).toThrow(/not a JSON object/);
    expect(() => convertBybitJson({ movimenti: {} }, [])).toThrow(/movimenti is not an array/);
  });

  it('lists a movement that is not an object, or whose fields have the wrong type, as a problem', () => {
    const { problems } = convert(['text', movement({ merchant: 42 }), movement({ merchant: '  ' }), movement({ tipo: null }), movement({ categoria: 5 })]);
    expect(problems.map((problem) => [problem.index, problem.reason])).toEqual([
      [1, 'is not an object'],
      [2, 'merchant is not text'],
      [3, 'merchant is empty'],
      [4, 'tipo is not text'],
      [5, 'categoria is not text'],
    ]);
  });

  it('reads the available balance, and refuses one that is not an amount', () => {
    expect(convertBybitJson(exportOf([], { saldo_disponibile_eur: 123.45 }), []).balance).toEqual({ amount: 12345, on: '2026-10-20' });
    expect(convertBybitJson(exportOf([]), []).balance).toBeNull();
    const bad = convertBybitJson(exportOf([], { saldo_disponibile_eur: '123.45' }), []);
    expect(bad.problems.map((problem) => [problem.index, problem.reason])).toEqual([[null, 'saldo_disponibile_eur is not a number']]);
  });
});

describe('the order', () => {
  it("keeps the JSON's order, newest first or not", () => {
    const { rows } = convert([
      movement({ data: '2026-10-05 10:00:00', merchant: 'C' }),
      movement({ data: '2026-10-01 10:00:00', merchant: 'A' }),
      movement({ data: '2026-10-03 10:00:00', merchant: 'B' }),
    ]);
    expect(rows.map((row) => row.commerciante)).toEqual(['C', 'A', 'B']);
  });
});

describe('the merchant identity', () => {
  const knownCsv = csv(
    CARD_HEADER,
    [
      cardRow({ at: '2026-10-03 09:15:00', merchant: 'BAKERY*CORNER 42', importo: '3.50', tipo: 'Autorizzazione (in sospeso)', stato: 'In corso' }),
      cardRow({ at: '2026-10-03 09:15:00', merchant: 'BAKERY*CORNER 42', clean: 'Corner Bakery', importo: '3.50', categoria: 'Food', sotto: 'Bakery' }),
      cardRow({ at: '2026-10-04 18:00:00', merchant: 'BOOKSHOP*TOWN', clean: 'Town Books', importo: '20.00', categoria: 'Shopping', sotto: 'Books' }),
      cardRow({ at: '2026-10-06 12:00:00', merchant: 'CAFE*ONE', importo: '2.00' }),
      cardRow({ at: '2026-10-06 12:00:00', merchant: 'CAFE*TWO', importo: '2.00' }),
    ],
    { bom: true, eol: '\r\n' }
  );
  const known = readKnownRows(knownCsv);

  it('reads every row of an earlier card-normalised CSV, an authorisation included', () => {
    expect(known).toHaveLength(5);
    expect(() => readKnownRows(csv(['data_ora', 'merchant'], [['2026-10-03 09:15:00', 'X']]))).toThrow(/does not match the card-normalised header/);
  });

  it('takes the merchant, the clean name and the categories from the row at the same timestamp', () => {
    const result = convertBybitJson(
      exportOf([movement({ merchant: 'Corner Bakery', categoria: 'Groceries (MCC 5411)' }), movement({ data: '2026-10-04 18:00:00', merchant: 'Town Books', importo_eur: -20 })]),
      known
    );
    expect(result.problems).toEqual([]);
    expect(result.fromGivenName).toEqual([]);
    expect(result.rows.map((row) => [row.commerciante, row.nome_pulito, row.categoria, row.sottocategoria])).toEqual([
      ['BAKERY*CORNER 42', 'Corner Bakery', 'Food', 'Bakery'],
      ['BOOKSHOP*TOWN', 'Town Books', 'Shopping', 'Books'],
    ]);
  });

  it('uses the name as given when no row has the timestamp, and lists the row', () => {
    const result = convertBybitJson(exportOf([movement({ data: '2026-10-07 08:00:00', merchant: 'New Place' })]), known);
    expect(result.rows.map((row) => [row.commerciante, row.nome_pulito])).toEqual([['New Place', '']]);
    expect(result.fromGivenName).toEqual([{ index: 1, at: '2026-10-07 08:00:00', merchant: 'New Place' }]);
  });

  it('refuses a timestamp whose earlier rows disagree on the merchant', () => {
    const result = convertBybitJson(exportOf([movement({ data: '2026-10-06 12:00:00', merchant: 'Cafe', importo_eur: -2 })]), known);
    expect(result.rows).toEqual([]);
    expect(result.problems.map((problem) => problem.reason)).toEqual([
      'the earlier rows at this timestamp disagree on the merchant: "CAFE*ONE", "CAFE*TWO"',
    ]);
  });
});

describe('the CSV it writes', () => {
  const result = convertBybitJson(
    exportOf([
      movement({ merchant: 'SHOP, "THE" ONE', importo_eur: -15, categoria: 'Shopping (MCC 5999)' }),
      movement({ data: '2026-10-04 11:00:00', merchant: 'SHOP, "THE" ONE', tipo: 'Refund', importo_eur: 5 }),
      movement({ data: '2026-10-05 07:30:00', merchant: 'PUMP*FUEL 7', stato: 'In Progress', importo_eur: -150, importo_contabilizzato_eur: -41.07 }),
    ]),
    []
  );

  it('has the format header exactly, after a byte-order mark', () => {
    const text = toCardCsv(result.rows);
    expect(text.startsWith('\uFEFF' + CARD_COLUMNS.join(',') + '\r\n')).toBe(true);
    expect(CARD_COLUMNS).toEqual(cardNormalised.header);
  });

  it('is read back by the card-normalised format, sign and amount intact', () => {
    const read = readStatement(toCardCsv(result.rows), 'card-normalised');
    expect(read.problems).toEqual([]);
    expect(read.skipped).toEqual([]);
    expect(read.rows.map((row) => [row.when, row.amount, row.description, row.identity, row.detail.category ?? ''])).toEqual([
      ['2026-10-03 09:15:00', -1500, 'SHOP, "THE" ONE', 'Addebito|SHOP, "THE" ONE', 'Shopping'],
      ['2026-10-04 11:00:00', 500, 'SHOP, "THE" ONE', 'Rimborso|SHOP, "THE" ONE', ''],
      ['2026-10-05 07:30:00', -4107, 'PUMP*FUEL 7', 'Addebito|PUMP*FUEL 7', ''],
    ]);
  });
});

describe('the command line', () => {
  /** @type {string} */
  let dir;
  /** @type {string[]} */
  let printed;
  const print = (/** @type {string} */ line) => {
    printed.push(line);
  };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'personalos-bybit-'));
    await writeFile(
      path.join(dir, 'good.json'),
      JSON.stringify(
        exportOf(
          [
            movement({ merchant: 'Corner Bakery' }),
            movement({ data: '2026-10-08 10:00:00', merchant: 'New Place', importo_eur: -4 }),
            movement({ data: '2026-10-09 10:00:00', stato: 'Reversed', importo_eur: 1.84 }),
          ],
          { saldo_disponibile_eur: 88.8 }
        )
      )
    );
    await writeFile(path.join(dir, 'bad.json'), JSON.stringify(exportOf([movement(), movement({ tipo: 'Transfer' })])));
    await writeFile(
      path.join(dir, 'known.csv'),
      csv(CARD_HEADER, [cardRow({ at: '2026-10-03 09:15:00', merchant: 'BAKERY*CORNER 42', clean: 'Corner Bakery', importo: '3.50' })], { bom: true, eol: '\r\n' })
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads its arguments strictly', () => {
    expect(parseArgs(['a.json', '--known', 'k1.csv', '--known', 'k2.csv', '--out', 'o.csv'])).toEqual({ jsonPath: 'a.json', known: ['k1.csv', 'k2.csv'], out: 'o.csv' });
    expect(parseArgs(['a.json'])).toEqual({ jsonPath: 'a.json', known: [], out: null });
    expect(() => parseArgs([])).toThrow(/one JSON file/);
    expect(() => parseArgs(['a.json', '--out'])).toThrow(/--out needs a value/);
    expect(() => parseArgs(['a.json', '--write'])).toThrow(/unknown option --write/);
  });

  it('prints the report and writes nothing without --out', async () => {
    printed = [];
    const outcome = await convertBybit({ jsonPath: path.join(dir, 'good.json'), known: [path.join(dir, 'known.csv')], out: null, print });
    expect(outcome).toEqual({ ok: true, written: false });
    const report = printed.join('\n');
    expect(report).toMatch(/dry run: nothing was written/);
    expect(report).toMatch(/Movements: 3 -- 2 converted, 1 skipped, 0 problem\(s\)/);
    expect(report).toMatch(/2026-10-09 10:00:00 {2}BAKERY\*CORNER 42 -- annulled authorisation/);
    expect(report).toMatch(/Identity from the name as given[^\n]*\n {2}2026-10-08 10:00:00 {2}New Place/);
    expect(report).toMatch(/88\.80 EUR available on 2026-10-20/);
  });

  it('writes the CSV with --out, and refuses to overwrite it', async () => {
    const out = path.join(dir, 'out.csv');
    printed = [];
    expect(await convertBybit({ jsonPath: path.join(dir, 'good.json'), known: [path.join(dir, 'known.csv')], out, print })).toEqual({ ok: true, written: true });
    const read = readStatement(await readFile(out, 'utf8'), 'card-normalised');
    expect(read.rows.map((row) => [row.identity, row.amount])).toEqual([
      ['Addebito|BAKERY*CORNER 42', -350],
      ['Addebito|New Place', -400],
    ]);
    await expect(convertBybit({ jsonPath: path.join(dir, 'good.json'), known: [], out, print })).rejects.toThrow(/already exists/);
  });

  it('writes nothing while a row is a problem', async () => {
    const out = path.join(dir, 'never.csv');
    printed = [];
    expect(await convertBybit({ jsonPath: path.join(dir, 'bad.json'), known: [], out, print })).toEqual({ ok: false, written: false });
    await expect(readFile(out, 'utf8')).rejects.toThrow(/ENOENT/);
    expect(printed.join('\n')).toMatch(/2026-10-03 09:15:00 {2}BAKERY\*CORNER 42 -- tipo "Transfer" is neither Purchase nor Refund/);
  });
});
