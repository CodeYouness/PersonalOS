/**
 * Money in a statement: decimal strings with a dot, read exactly into integer
 * minor units (ADR 0009). Never a float: `1011.5899999999999` -- float noise a
 * spreadsheet left in a balance column -- is read digit by digit and rounded
 * to the currency's minor unit, half away from zero, to 101159.
 */

/** Digits after the point in each currency's minor unit; a currency not listed has two. */
const MINOR_DIGITS = Object.freeze({ EUR: 2 });

/**
 * @param {string} currency
 * @returns {number}
 */
export function minorDigits(currency) {
  return /** @type {Record<string, number>} */ (MINOR_DIGITS)[currency] ?? 2;
}

/**
 * A signed decimal with a dot ("-9.99", "25.00", "90", "+1.5",
 * "1011.5899999999999") as integer minor units, rounded half away from zero.
 * Null when it is not such a number -- a comma, a thousands separator, an
 * exponent or an empty cell -- so a caller reports it rather than guessing.
 *
 * @param {string} text
 * @param {number} [digits]
 * @returns {number | null}
 */
export function parseMinorUnits(text, digits = 2) {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (match === null) return null;
  const fraction = match[3] ?? '';
  const kept = BigInt(match[2] + fraction.slice(0, digits).padEnd(digits, '0'));
  // Half away from zero: the magnitude goes up when the first dropped digit is 5 or more.
  const magnitude = kept + (fraction.length > digits && fraction[digits] >= '5' ? 1n : 0n);
  const value = Number(match[1] === '-' ? -magnitude : magnitude);
  if (!Number.isSafeInteger(value)) return null;
  // -0.001 rounds to zero; it is zero, not "minus zero".
  return value === 0 ? 0 : value;
}

/**
 * A running balance as integer minor units: a dot decimal as for an amount,
 * or the same in exponent notation (`-4.547473508864641e-13`, float noise a
 * spreadsheet left where a balance is zero), expanded exactly as text and
 * rounded the same way. Only for a balance column: a balance is derived by
 * the bank's export, so its noise is noise; an amount is what moved and stays
 * strict (parseMinorUnits).
 *
 * @param {string} text
 * @param {number} [digits]
 * @returns {number | null}
 */
export function parseBalanceMinorUnits(text, digits = 2) {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d{1,3})$/.exec(text.trim());
  if (match === null) return parseMinorUnits(text, digits);
  const fraction = match[3] ?? '';
  const mantissa = match[2] + fraction;
  // The point sits after the integer digits, moved by the exponent.
  const point = match[2].length + Number(match[4]);
  const plain =
    point <= 0 ? '0.' + '0'.repeat(-point) + mantissa :
    point >= mantissa.length ? mantissa + '0'.repeat(point - mantissa.length) :
    mantissa.substring(0, point) + '.' + mantissa.substring(point);
  return parseMinorUnits(match[1] + plain, digits);
}

/**
 * Minor units as the report prints them: "-1,234.56". Integer arithmetic only.
 *
 * @param {number} minor
 * @returns {string}
 */
export function formatMinor(minor) {
  const sign = minor < 0 ? '-' : '';
  const magnitude = Math.abs(minor);
  const whole = Math.floor(magnitude / 100).toLocaleString('en-GB');
  return sign + whole + '.' + String(magnitude % 100).padStart(2, '0');
}
