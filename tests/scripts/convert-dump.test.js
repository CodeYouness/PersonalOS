/**
 * Converting what the browser saved from a bank's or a card's own API (a
 * dump) into the file the next step reads: each rule, the month window, the
 * round trip through the real formats and the card's converter, and the
 * command line on temporary files.
 *
 * Every merchant, description, id and amount here is invented. The
 * repository is public.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { convertDumpFile, parseArgs } from '@/scripts/convert-dump.js';
import { convertDump, toOutput } from '@/scripts/statement-import/convert/api-dump.js';
import { convertBybitJson } from '@/scripts/statement-import/convert/bybit-json.js';
import { readStatement } from '@/scripts/statement-import/read.js';

const ZONE = 'Europe/Rome';
const ALL = { from: null, to: null };

/** 2026-10-03 09:15:00 in Rome (UTC+2 in October). */
const OCT_3_0915 = String(Date.UTC(2026, 9, 3, 7, 15, 0));

/** @param {Record<string, unknown>} [fields] a card record, a completed purchase unless told otherwise */
function card(fields = {}) {
  return {
    merchName: 'BAKERY*CORNER 42', txnType: 'deduct', displayStatus: '1', totalTransactionAmount: '3.5',
    txnTime: OCT_3_0915, merchMccCategoryName: 'Food', mccCode: '5462', ...fields,
  };
}

/** @param {Record<string, unknown>} [fields] a Mediolanum record, money out unless told otherwise */
function med(fields = {}) {
  return {
    idMovimento: '900001', descrizioneBreve: 'PAGAMENTO Shop', dataOperazione: '2026-10-05T00:00:00Z', dataValuta: '2026-10-06T00:00:00Z',
    codiceValuta: 'EUR', descrizione: 'PAGAMENTO   CON CARTA\n PRESSO SHOP', importo: -12.5, stato: 'X',
    tagAutomatici: { descrizioneTag1: 'Uscita', descrizioneTag2: 'ACCOUNT-0', descrizioneTag3: 'Shop', descrizioneTag4: 'Pagamenti' },
    ...fields,
  };
}

/** @param {Record<string, unknown>} [fields] a Crédit Agricole record */
function ca(fields = {}) {
  return {
    movementDate: '2026-10-07T00:00:00+02:00', currencyDate: '2026-10-07T00:00:00+02:00', amountEuro: -20, amount: -20,
    currency: 'EUR', cause: 'DISPOSIZIONE DI PAGAMENTO          ', description: 'PAGAMENTO  A   NEGOZIO\tUNO', finalBalance: 80.00000000000001,
    openingBalance: 100, recorded: true, ...fields,
  };
}

/**
 * @param {string} source
 * @param {unknown[]} records
 */
const dump = (source, records) => ({ source, fetchedAt: '2026-10-20T10:00:00Z', records });

describe('the dump itself', () => {
  it('refuses what is not a dump', () => {
    expect(() => convertDump([], ALL, ZONE)).toThrow('not a JSON object');
    expect(() => convertDump({ source: 'some-bank', records: [] }, ALL, ZONE)).toThrow('source is not one of');
    expect(() => convertDump({ source: 'mediolanum-api' }, ALL, ZONE)).toThrow('records is not an array');
  });

  it('refuses a month that is not YYYY-MM, or a window that ends before it starts', () => {
    expect(() => convertDump(dump('mediolanum-api', []), { from: '2026-13', to: null }, ZONE)).toThrow('not YYYY-MM');
    expect(() => convertDump(dump('mediolanum-api', []), { from: '2026-10', to: '2026-09' }, ZONE)).toThrow('is after');
  });
});

describe('the Bybit card', () => {
  it('writes a completed purchase as the card JSON reads it, at the local time, negative', () => {
    const result = convertDump(dump('bybit-card-api', [card()]), ALL, ZONE);
    expect(result.problems).toEqual([]);
    expect(result.card?.movimenti).toEqual([
      { data: '2026-10-03 09:15:00', merchant: 'BAKERY*CORNER 42', tipo: 'Purchase', stato: 'Successful', importo_eur: -3.5, categoria: 'Food (MCC 5462)' },
    ]);
    expect(result.card?.estratto_il).toBe('2026-10-20');
  });

  it('keeps a refund positive and a pending one pending, and makes a released authorisation an annulled one', () => {
    const result = convertDump(dump('bybit-card-api', [
      card({ txnType: 'refund', totalTransactionAmount: '2.62' }),
      card({ txnType: 'freeze', displayStatus: '0', totalTransactionAmount: '100.00' }),
      card({ txnType: 'unfreeze', displayStatus: '1' }),
      card({ displayStatus: '3' }),
    ]), ALL, ZONE);
    expect(result.card?.movimenti.map((row) => [row.tipo, row.stato, row.importo_eur])).toEqual([
      ['Refund', 'Successful', 2.62],
      ['Purchase', 'In Progress', -100],
      ['Purchase', 'Reversed', -3.5],
      ['Purchase', 'Reversed', -3.5],
    ]);
  });

  it('leaves a declined payment out and says so', () => {
    const result = convertDump(dump('bybit-card-api', [card({ displayStatus: '2' })]), ALL, ZONE);
    expect(result.card?.movimenti).toEqual([]);
    expect(result.left).toEqual([{ index: 1, day: '2026-10-03', text: 'BAKERY*CORNER 42', reason: 'declined: no money moved' }]);
  });

  it('never guesses: an unknown type or state, an unreadable amount or time is a problem', () => {
    const result = convertDump(dump('bybit-card-api', [
      card({ txnType: 'cashback' }),
      card({ displayStatus: '7' }),
      card({ totalTransactionAmount: '-3.50' }),
      card({ totalTransactionAmount: '3.505' }),
      card({ txnTime: 'yesterday' }),
      card({ merchName: ' ' }),
    ]), ALL, ZONE);
    expect(result.problems.map((row) => row.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.problems[0].reason).toContain('its sign is unknown');
  });

  it('dates by the local day, so a payment just after midnight belongs to its own month', () => {
    // 2026-10-31 23:30 UTC is 1 November 00:30 in Rome (UTC+1 after the clocks go back).
    const late = card({ txnTime: String(Date.UTC(2026, 9, 31, 23, 30, 0)) });
    expect(convertDump(dump('bybit-card-api', [late]), { from: '2026-11', to: '2026-11' }, ZONE).card?.movimenti[0].data).toBe('2026-11-01 00:30:00');
    expect(convertDump(dump('bybit-card-api', [late]), { from: '2026-10', to: '2026-10' }, ZONE).outsideWindow).toBe(1);
  });

  it('goes through the card converter as the hand-made export did', () => {
    const result = convertDump(dump('bybit-card-api', [card(), card({ txnType: 'freeze', displayStatus: '0' })]), ALL, ZONE);
    const converted = convertBybitJson(JSON.parse(toOutput(result)), []);
    expect(converted.problems).toEqual([]);
    expect(converted.rows.map((row) => [row.data_ora, row.commerciante, row.importo, row.tipo, row.categoria])).toEqual([
      ['2026-10-03 09:15:00', 'BAKERY*CORNER 42', '3.50', 'Addebito', 'Food'],
    ]);
    expect(converted.skipped.map((row) => row.reason)).toEqual(['pending, no booked amount']);
  });
});

describe('Mediolanum', () => {
  it('writes the typed row: the bank direction, the signed amount, the long text on one line, the bank id', () => {
    const result = convertDump(dump('mediolanum-api', [med()]), ALL, ZONE);
    expect(result.rows).toEqual([{
      data_operazione: '2026-10-05', data_valuta: '2026-10-06', tipo: 'Uscita', importo: '-12.5', valuta: 'EUR',
      controparte: 'Shop', categoria: 'Pagamenti', descrizione_breve: 'PAGAMENTO Shop', descrizione: 'PAGAMENTO CON CARTA PRESSO SHOP',
      id_movimento: '900001',
    }]);
  });

  it('reads back through bank-normalised-typed, keeping the bank id as the stable id', () => {
    const result = convertDump(dump('mediolanum-api', [med(), med({ idMovimento: '900002', importo: 144, tagAutomatici: { descrizioneTag1: 'Entrata' } })]), ALL, ZONE);
    const read = readStatement(toOutput(result), 'bank-normalised-typed');
    expect(read.problems).toEqual([]);
    expect(read.rows.map((row) => [row.date, row.amount, row.bankId])).toEqual([['2026-10-05', -1250, '900001'], ['2026-10-05', 14400, '900002']]);
  });

  it('leaves a direction that disagrees with the sign for the format to block', () => {
    const result = convertDump(dump('mediolanum-api', [med({ tagAutomatici: { descrizioneTag1: 'Entrata' } })]), ALL, ZONE);
    expect(readStatement(toOutput(result), 'bank-normalised-typed').problems[0].reason).toContain('disagrees with tipo');
  });

  it('keeps only the months asked for', () => {
    const result = convertDump(dump('mediolanum-api', [med(), med({ dataOperazione: '2026-08-31T00:00:00Z' }), med({ dataOperazione: '2026-11-01T00:00:00Z' })]), { from: '2026-09', to: '2026-10' }, ZONE);
    expect(result.rows.map((row) => row.data_operazione)).toEqual(['2026-10-05']);
    expect([result.inWindow, result.outsideWindow]).toEqual([1, 2]);
    expect(result.range).toEqual({ first: '2026-10-05', last: '2026-10-05' });
  });

  it('calls a record with no date or amount a problem', () => {
    const result = convertDump(dump('mediolanum-api', [med({ dataOperazione: '05/10/2026' }), med({ importo: '12,50' })]), ALL, ZONE);
    expect(result.problems.map((row) => row.reason)).toEqual(['dataOperazione is not an ISO date', 'importo is not a number']);
  });
});

describe('Crédit Agricole', () => {
  it('writes the signed row with the text exactly as the earlier files did: causale trimmed, descrizione on one line', () => {
    const result = convertDump(dump('credit-agricole-api', [ca()]), ALL, ZONE);
    expect(result.rows).toEqual([{
      data_operazione: '2026-10-07', data_valuta: '2026-10-07', importo: '-20', valuta: 'EUR',
      causale: 'DISPOSIZIONE DI PAGAMENTO', descrizione: 'PAGAMENTO A NEGOZIO UNO', saldo_dopo_movimento: '80.00000000000001',
    }]);
  });

  it('reads back through bank-normalised-signed with its running balance', () => {
    const read = readStatement(toOutput(convertDump(dump('credit-agricole-api', [ca()]), ALL, ZONE)), 'bank-normalised-signed');
    expect(read.problems).toEqual([]);
    expect(read.rows.map((row) => [row.date, row.amount, row.balanceAfter, row.identity])).toEqual([
      ['2026-10-07', -2000, 8000, 'DISPOSIZIONE DI PAGAMENTO|PAGAMENTO A NEGOZIO UNO'],
    ]);
  });
});

describe('the command line', () => {
  /** @type {string} */
  let dir;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'convert-dump-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads its arguments strictly', () => {
    expect(parseArgs(['d.json', '--from', '2026-09', '--to', '2026-10', '--out', 'o.csv'])).toEqual({ dumpPath: 'd.json', from: '2026-09', to: '2026-10', out: 'o.csv' });
    expect(() => parseArgs(['d.json', '--month', '2026-09'])).toThrow('unknown option');
    expect(() => parseArgs(['d.json', '--from'])).toThrow('needs a value');
    expect(() => parseArgs([])).toThrow('name one dump file');
  });

  it('prints a dry run, then writes the file once and refuses to overwrite it', async () => {
    const input = path.join(dir, 'dump.json');
    const out = path.join(dir, 'out.csv');
    await writeFile(input, JSON.stringify(dump('credit-agricole-api', [ca()])));
    /** @type {string[]} */
    const lines = [];
    const options = { dumpPath: input, from: null, to: null, timeZone: ZONE, print: (/** @type {string} */ line) => lines.push(line) };

    expect(await convertDumpFile({ ...options, out: null })).toEqual({ ok: true, written: false });
    expect(lines[0]).toContain('dry run');
    expect(await convertDumpFile({ ...options, out })).toEqual({ ok: true, written: true });
    expect((await readFile(out, 'utf8')).startsWith('\uFEFFdata_operazione,')).toBe(true);
    await expect(convertDumpFile({ ...options, out })).rejects.toThrow('already exists');
  });

  it('writes nothing when a record is a problem', async () => {
    const input = path.join(dir, 'bad.json');
    await writeFile(input, JSON.stringify(dump('mediolanum-api', [med({ importo: null })])));
    expect(await convertDumpFile({ dumpPath: input, from: null, to: null, out: path.join(dir, 'never.csv'), timeZone: ZONE, print: () => {} })).toEqual({ ok: false, written: false });
  });
});
