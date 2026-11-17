/**
 * The statement formats, by id. A format is a small module: its header, and
 * a parse from rows to movements with every skipped line and its reason. A
 * new bank's export is a new module and a line here.
 *
 * The ids are generic where the file is a normalised shape any bank's export
 * can be turned into, and named for the bank only for its own raw export.
 */

import { bankNormalisedSigned } from './bank-normalised-signed.js';
import { bankNormalisedTyped } from './bank-normalised-typed.js';
import { cardNormalised } from './card-normalised.js';
import { revolut } from './revolut.js';

/** @type {readonly import('./common.js').StatementFormat[]} */
export const FORMATS = Object.freeze([revolut, cardNormalised, bankNormalisedSigned, bankNormalisedTyped]);

/**
 * @param {string} id
 * @returns {import('./common.js').StatementFormat | undefined}
 */
export function formatById(id) {
  return FORMATS.find((format) => format.id === id);
}

/**
 * How a header differs from a format's: the columns it lacks and the ones it
 * has that the format does not. Both empty: it matches. Order is not
 * checked; names are, exactly.
 *
 * @param {import('./common.js').StatementFormat} format
 * @param {string[]} header
 * @returns {{ missing: string[], unexpected: string[] }}
 */
export function headerDifference(format, header) {
  return {
    missing: format.header.filter((name) => !header.includes(name)),
    unexpected: header.filter((name) => !format.header.includes(name)),
  };
}
