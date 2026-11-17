/**
 * What every statement format shares: the shapes a format returns, and the
 * readers for the cells they have in common. Pure.
 *
 * @typedef {object} StatementRow one movement a format read from one line
 * @property {number} line the line of the file it starts on, the header being 1
 * @property {string | null} product the account within the file it belongs to
 *   (Revolut's `Prodotto`); null when the whole file is one account
 * @property {string} date day key the movement is dated
 * @property {string} when the timestamp or day the bank gives, as written --
 *   part of the stable id
 * @property {number} amount signed minor units from the account's side,
 *   before any fee
 * @property {number} fee minor units, never negative, charged on the row and
 *   imported as a movement of its own; 0 for none
 * @property {string} currency
 * @property {string} description
 * @property {string} identity the bank's own text the stable id hashes -- the
 *   raw text, not a cleaned-up name that could change between exports
 * @property {string | null} bankId the bank's id for the movement, when the
 *   file has one
 * @property {number | null} balanceAfter the running balance after the row,
 *   fee included, in minor units; null when the file has none
 * @property {string} balanceWhen the order the running balance follows: the
 *   timestamp the bank booked the row at. Usually `when`; Revolut's balance
 *   follows completion, not start
 * @property {Record<string, string>} detail what the bank said that a
 *   transaction has no field for -- its category, merchant, counterparty,
 *   movement type -- kept on the origin for categorising
 *
 * @typedef {{ line: number, reason: string }} Skip a line that is not a movement, and why
 * @typedef {{ line: number, reason: string }} Problem a line that could not be read: it blocks the write
 *
 * @typedef {{ line: number, values: Record<string, string> }} RawRow a CSV record by column name
 *
 * @typedef {object} ParseResult
 * @property {StatementRow[]} rows
 * @property {Skip[]} skipped
 * @property {Problem[]} problems
 *
 * @typedef {object} StatementFormat
 * @property {string} id what `--format` names
 * @property {string} label one line for the report
 * @property {readonly string[]} header the columns, exactly
 * @property {boolean} runningBalance whether the file carries a balance after each row
 * @property {string | null} mainProduct the product `--account` names; null
 *   when the file has no products
 * @property {(rows: RawRow[]) => ParseResult} parse
 */

import { isDayKey } from '../../../lib/domain/dates.js';
import { parseBalanceMinorUnits, parseMinorUnits } from '../money.js';

/**
 * `YYYY-MM-DD HH:MM:SS`, local time with no zone, as its day key and the text
 * itself. Null when it is not one.
 *
 * @param {string} text
 * @returns {{ date: string, when: string } | null}
 */
export function parseLocalTimestamp(text) {
  const match = /^(\d{4}-\d{2}-\d{2}) ([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.exec(text.trim());
  if (match === null || !isDayKey(match[1])) return null;
  return { date: match[1], when: text.trim() };
}

/**
 * `YYYY-MM-DD` as a day key, or null.
 *
 * @param {string} text
 * @returns {string | null}
 */
export function parseDay(text) {
  const day = text.trim();
  return isDayKey(day) ? day : null;
}

/**
 * A cell that is an amount, or null; an empty cell is `empty` when given.
 *
 * @param {string} text
 * @param {number | null} [empty] what an empty cell reads as; null: it is unreadable
 * @returns {number | null}
 */
export function readAmount(text, empty = null) {
  if (text.trim() === '') return empty;
  return parseMinorUnits(text);
}

/**
 * A running-balance cell, or null; empty is null too. Exponent notation is
 * accepted here and only here (parseBalanceMinorUnits).
 *
 * @param {string} text
 * @returns {number | null}
 */
export function readBalance(text) {
  if (text.trim() === '') return null;
  return parseBalanceMinorUnits(text);
}

/**
 * The detail kept on the origin: the non-empty cells only, trimmed.
 *
 * @param {Record<string, string>} fields
 * @returns {Record<string, string>}
 */
export function detailOf(fields) {
  /** @type {Record<string, string>} */
  const detail = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value.trim() !== '') detail[key] = value.trim();
  }
  return detail;
}
