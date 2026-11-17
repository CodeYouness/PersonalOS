/**
 * Reading a statement (ADR 0041): the CSV reader, money from decimal text,
 * each format's parse with every skip reason, the header check, and the
 * stable ids. Pure: no store.
 */

import { describe, expect, it } from 'vitest';

import { parseCsv, parseCsvRecords } from '@/scripts/csv.js';
import { movementKeys } from '@/scripts/statement-import/identity.js';
import { parseBalanceMinorUnits, parseMinorUnits } from '@/scripts/statement-import/money.js';
import { chronological, runningBalance } from '@/scripts/statement-import/plan.js';
import { readStatement } from '@/scripts/statement-import/read.js';
import {
  CARD_HEADER,
  REVOLUT_HEADER,
  SIGNED_HEADER,
  cardExport,
  csv,
  revolutExport,
  revolutRow,
  signedExport,
  signedRows,
  signedSameDayRows,
  TYPED_HEADER,
  typedExport,
  typedRows,
} from './statement-fixture.js';

describe('the CSV reader', () => {
  it('reads quotes, doubled quotes, commas and line breaks inside quotes, a BOM, CRLF and a trailing newline', () => {
    const text = '\uFEFFa,b,c\r\n"x, y","say ""hi""","two\r\nlines"\r\n1,,3\r\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'two\r\nlines'],
      ['1', '', '3'],
    ]);
  });

  it('reads a last line with no newline, and leaves blank lines out', () => {
    expect(parseCsv('a,b\n\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('says the line each record starts on, counting line breaks inside quotes', () => {
    const records = parseCsvRecords('h1,h2\n"multi\nline",x\n\nlast,y\n');
    expect(records.map((record) => record.line)).toEqual([1, 2, 5]);
  });

  it('round-trips what the fixtures write', () => {
    const text = csv(['a', 'b'], [['Interessi nel conto "Deposito", Jul 4', '-1.00']], { bom: true, eol: '\r\n' });
    expect(parseCsv(text)).toEqual([
      ['a', 'b'],
      ['Interessi nel conto "Deposito", Jul 4', '-1.00'],
    ]);
  });
});

describe('money from decimal text', () => {
  it('is integer minor units, read exactly', () => {
    expect(parseMinorUnits('-9.99')).toBe(-999);
    expect(parseMinorUnits('25.00')).toBe(2500);
    expect(parseMinorUnits('90')).toBe(9000);
    expect(parseMinorUnits('-0.31')).toBe(-31);
    expect(parseMinorUnits('+1.5')).toBe(150);
    // 0.1 + 0.2 territory: never a float on the way.
    expect(parseMinorUnits('0.29')).toBe(29);
    expect(parseMinorUnits('1.15')).toBe(115);
  });

  it('rounds float noise to the cent, half away from zero', () => {
    expect(parseMinorUnits('1011.5899999999999')).toBe(101159);
    expect(parseMinorUnits('1010.5900000000001')).toBe(101059);
    expect(parseMinorUnits('0.005')).toBe(1);
    expect(parseMinorUnits('-0.005')).toBe(-1);
    expect(parseMinorUnits('0.0049999')).toBe(0);
    expect(Object.is(parseMinorUnits('-0.001'), 0)).toBe(true);
  });

  it('refuses what is not a dot decimal rather than guess', () => {
    for (const text of ['', '1,50', '1.234,56', '1e3', 'abc', '--1', '1.2.3']) expect(parseMinorUnits(text)).toBeNull();
  });

  it('reads a balance in exponent notation, and only a balance', () => {
    expect(parseBalanceMinorUnits('-4.547473508864641e-13')).toBe(0);
    expect(parseBalanceMinorUnits('1.1368683772161603e-13')).toBe(0);
    expect(parseBalanceMinorUnits('1.0115899999999999e3')).toBe(101159);
    expect(parseBalanceMinorUnits('-5E-3')).toBe(-1);
    expect(parseBalanceMinorUnits('12E2')).toBe(120000);
    expect(parseBalanceMinorUnits('1011.5899999999999')).toBe(101159);
    expect(parseBalanceMinorUnits('1e')).toBeNull();
    // An amount stays strict.
    expect(parseMinorUnits('-4.547473508864641e-13')).toBeNull();
  });

  it('is always an integer', () => {
    for (const text of ['1011.5899999999999', '0.1', '-7.777', '123456.789']) expect(Number.isInteger(parseMinorUnits(text))).toBe(true);
  });
});

describe('the header', () => {
  it('fails loudly when it does not match the declared format', () => {
    expect(() => readStatement(signedExport(), 'revolut')).toThrow(/does not match the format "revolut".*missing: Tipo/);
    expect(() => readStatement(signedExport(), 'bank-normalised-typed')).toThrow(/missing: tipo.*not expected: causale/);
  });

  it('refuses a format that does not exist, naming the ones that do', () => {
    expect(() => readStatement(signedExport(), 'mybank')).toThrow(/revolut, card-normalised, bank-normalised-signed, bank-normalised-typed/);
  });

  it('chooses the format when none is declared, and refuses a header no format has', () => {
    expect(readStatement(typedExport(), null)).toMatchObject({ format: { id: 'bank-normalised-typed' }, detected: true });
    expect(() => readStatement('a,b\n1,2\n', null)).toThrow(/no format matches/);
  });

  it('reads a header that starts with a BOM', () => {
    expect(readStatement(csv(SIGNED_HEADER, signedRows(), { bom: true, eol: '\r\n' }), 'bank-normalised-signed').rows).toHaveLength(5);
  });

  it('makes a row with the wrong number of fields a problem', () => {
    const read = readStatement(SIGNED_HEADER.join(',') + '\n2026-06-01,2026-06-01,-1.00,EUR\n', 'bank-normalised-signed');
    expect(read.problems).toEqual([{ line: 2, reason: 'has 4 fields, the header has 7' }]);
  });
});

describe('revolut', () => {
  const read = readStatement(revolutExport(), 'revolut');

  it('imports completed rows, dated by the day they started, with the fee apart', () => {
    const coffee = read.rows.find((row) => row.description === 'Coffee Bar' && row.amount < 0);
    expect(coffee).toMatchObject({
      product: 'Attuale', date: '2026-03-01', when: '2026-03-01 23:50:13', balanceWhen: '2026-03-03 12:21:25', amount: -240, fee: 0, balanceAfter: 18872,
    });
    expect(coffee?.detail).toEqual({ type: 'Pagamento con carta', product: 'Attuale', completedAt: '2026-03-03 12:21:25' });
    const exchange = read.rows.find((row) => row.description === 'Conversione in TRY');
    expect(exchange).toMatchObject({ amount: -1921, fee: 19, balanceAfter: 21932 });
  });

  it('walks the running balance in completion order, where start order breaks it', () => {
    const current = read.rows.filter((row) => row.product === 'Attuale' && row.currency === 'EUR');
    expect(runningBalance(chronological(current, 'balanceWhen'))).toEqual({ opening: 20000, closing: 22132, chainBreaks: 0 });
    const byStart = runningBalance(chronological(current, 'when'));
    expect(byStart.chainBreaks).toBeGreaterThan(0);
    expect(byStart.opening).toBe(19112);
  });

  it('reads a completed row with no completion date in its start order', () => {
    const rows = readStatement(csv(REVOLUT_HEADER, [revolutRow({ inizio: '2026-03-02 10:00:00', fine: '', descrizione: 'x', importo: '-1.00', saldo: '1.00' })]), 'revolut').rows;
    expect(rows[0].balanceWhen).toBe('2026-03-02 10:00:00');
  });

  it('reads a quoted description with commas and doubled quotes, on its own product', () => {
    const interest = read.rows.find((row) => row.product === 'Deposito');
    expect(interest).toMatchObject({
      description: 'Interessi netti pagati nel conto "Conto deposito" in data Apr 4, 2026',
      amount: 16,
      fee: 4,
      balanceAfter: 300012,
    });
  });

  it('skips a cancelled row and one in any other state, with the state as the reason', () => {
    expect(read.skipped).toEqual([
      { line: 5, reason: 'cancelled' },
      { line: 10, reason: 'not completed: IN SOSPESO' },
    ]);
    expect(read.problems).toEqual([]);
  });

  it('makes a negative fee or an unreadable date a problem', () => {
    const bad = readStatement(
      csv(REVOLUT_HEADER, [
        revolutRow({ inizio: '2026-03-02', descrizione: 'x', importo: '-1.00', saldo: '1.00' }),
        revolutRow({ inizio: '2026-03-02 10:00:00', descrizione: 'y', importo: '-1.00', costo: '-0.10', saldo: '1.00' }),
      ]),
      'revolut'
    );
    expect(bad.problems.map((problem) => problem.line)).toEqual([2, 3]);
    expect(bad.rows).toEqual([]);
  });
});

describe('card-normalised', () => {
  const read = readStatement(cardExport(), 'card-normalised');

  it('signs the amount from tipo and describes by the clean name, else the merchant', () => {
    expect(read.rows.map((row) => [row.description, row.amount])).toEqual([
      ['Coffee Bar', -240],
      ['Coffee Bar', -240],
      ['BOOKS LTD', -1500],
      ['BOOKS LTD', 500],
    ]);
  });

  it("keeps the issuer's category, the merchant and the two columns it does not apply", () => {
    expect(read.rows[2].detail).toEqual({ type: 'Addebito', merchant: 'BOOKS LTD', category: 'Shopping', subcategory: 'Books', fxFee: '30', cashback: '15' });
    expect(read.rows[2].fee).toBe(0);
    expect(read.rows[2].balanceAfter).toBeNull();
  });

  it('skips authorisations and every state but Completata, each with its reason', () => {
    expect(read.skipped.map((skip) => skip.reason)).toEqual([
      'pending authorisation',
      'authorisation released',
      'not completed: In corso',
      'not completed: Stornata',
      'not completed: Fallita',
    ]);
  });

  it('refuses to guess the sign of a tipo it does not know', () => {
    const bad = readStatement(csv(CARD_HEADER, [['2026-05-01 08:00:00', 'X', '', '1.00', 'EUR', 'Storno', 'Completata', '', '', '0', '0']]), 'card-normalised');
    expect(bad.problems[0].reason).toMatch(/sign is unknown/);
  });
});

describe('bank-normalised-signed', () => {
  const read = readStatement(signedExport(), 'bank-normalised-signed');

  it('reads signed and integer amounts, and the balance with its float noise rounded', () => {
    expect(read.rows.map((row) => row.amount)).toEqual([-100, -100, -7810, 9000, -31]);
    expect(read.rows.map((row) => row.balanceAfter)).toEqual([100959, 101059, 101159, 108969, 99969]);
    expect(read.rows[3]).toMatchObject({ date: '2026-06-02', description: 'Salary June', detail: { type: 'ACCREDITO EMOLUMENTI', valueDate: '2026-06-01' } });
  });

  it('is put in the order it happened, its running balance unbroken', () => {
    const sequence = chronological(read.rows, 'balanceWhen');
    expect(sequence.map((row) => row.balanceAfter)).toEqual([99969, 108969, 101159, 101059, 100959]);
    expect(runningBalance(sequence)).toEqual({ opening: 100000, closing: 100959, chainBreaks: 0 });
  });

  it('reads several rows a day newest first, a zero balance in exponent notation included', () => {
    const rows = readStatement(signedExport(signedSameDayRows()), 'bank-normalised-signed');
    expect(rows.problems).toEqual([]);
    expect(rows.rows.map((row) => row.balanceAfter)).toEqual([0, 10000, 11500, 1500, 2000, 0]);
    const sequence = chronological(rows.rows, 'balanceWhen');
    expect(sequence.map((row) => row.description)).toEqual(['Transfer to savings', 'Reversal', 'Payment A', 'Cash deposit', 'Payment B', 'Transfer out']);
    expect(runningBalance(sequence)).toEqual({ opening: 5000, closing: 0, chainBreaks: 0 });
  });

  it('refuses an amount in exponent notation: an amount is what moved, not noise', () => {
    const rows = signedSameDayRows();
    rows[1] = [...rows[1]];
    rows[1][2] = '-1.5e1';
    expect(readStatement(signedExport(rows), 'bank-normalised-signed').problems).toEqual([{ line: 3, reason: 'importo "-1.5e1" is not a number' }]);
  });
});

describe('bank-normalised-typed', () => {
  const read = readStatement(typedExport(), 'bank-normalised-typed');

  it('blocks a sign that disagrees with tipo, and a zero', () => {
    const rows = typedRows().map((row) => [...row]);
    rows[0][3] = '12.50';
    rows[1][3] = '-200.00';
    rows[2][3] = '0';
    expect(readStatement(csv(TYPED_HEADER, rows), 'bank-normalised-typed').problems).toEqual([
      { line: 2, reason: 'importo "12.50" disagrees with tipo Uscita (Uscita is negative)' },
      { line: 3, reason: 'importo "-200.00" disagrees with tipo Entrata (Entrata is positive)' },
      { line: 4, reason: 'importo is zero: nothing moved' },
    ]);
  });

  it("reads the signed amount, keeps the bank's id and what it says about the movement", () => {
    expect(read.rows.map((row) => [row.amount, row.bankId, row.description])).toEqual([
      [-1250, 'MOV-0003', 'Pizza Place'],
      [20000, 'MOV-0002', 'Transfer from A Friend'],
      [-4500, 'MOV-0001', 'Grocer'],
    ]);
    expect(read.rows[1].detail).toEqual({
      type: 'Entrata',
      counterparty: 'A Friend',
      category: 'Transfers',
      fullText: 'Incoming transfer, reason: "dinner, tickets"',
      valueDate: '2026-07-02',
    });
  });
});

describe('the stable id', () => {
  const rows = readStatement(signedExport(), 'bank-normalised-signed').rows;
  const keysOf = (/** @type {typeof rows} */ list) => movementKeys(list).keys;

  it('is the same on a second read of the same file', () => {
    expect(keysOf(readStatement(signedExport(), 'bank-normalised-signed').rows)).toEqual(keysOf(rows));
  });

  it('tells two identical rows of one day apart, and keeps them two in any order', () => {
    const keys = keysOf(rows);
    expect(new Set(keys).size).toBe(5);
    const reordered = readStatement(signedExport([...signedRows()].reverse()), 'bank-normalised-signed').rows;
    expect(new Set(keysOf(reordered))).toEqual(new Set(keys));
  });

  it('does not change for the rows a later, overlapping export shares', () => {
    const later = [['2026-06-09', '2026-06-09', '-5.00', 'EUR', 'DISPOSIZIONE DI PAGAMENTO', 'Payment to Shop', '1004.59'], ...signedRows().slice(0, 3)];
    const shared = keysOf(readStatement(signedExport(later), 'bank-normalised-signed').rows);
    // Lines 1-3 of the first file are the later file's 2-4.
    expect(shared.slice(1)).toEqual(keysOf(rows).slice(0, 3));
  });

  it("is the bank's id when the file has one, and a bank id seen twice is a problem", () => {
    const typed = readStatement(typedExport(), 'bank-normalised-typed').rows;
    expect(movementKeys(typed).keys).toEqual(['id:MOV-0003', 'id:MOV-0002', 'id:MOV-0001']);
    expect(movementKeys([...typed, typed[0]]).problems).toEqual([{ line: 2, reason: 'the bank id "MOV-0003" is also on line 2' }]);
  });
});
