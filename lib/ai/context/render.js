/**
 * How a record is written for the model: plain text, one fact a line.
 *
 * Money is an integer in minor units and stays one here -- the text is cut
 * from the digits, never from a division that could round -- and a day is a
 * day key or a plain "4 Jan 2026", never a locale's guess.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A label the panel shows after the type badge: short enough to sit in a line. */
const LABEL_CHARS = 60;

/**
 * "-18.40 EUR" from -1840. Integer arithmetic on the digits only.
 *
 * @param {number} minor integer minor units, signed
 * @param {string} currency ISO code
 * @returns {string}
 */
export function formatMoney(minor, currency) {
  const magnitude = Math.abs(minor);
  const cents = magnitude % 100;
  const whole = (magnitude - cents) / 100;
  return (minor < 0 ? '-' : '') + whole + '.' + String(cents).padStart(2, '0') + ' ' + currency;
}

/**
 * Units held, stored as an integer count of 10^-8: "10", "0.5", "1.25".
 *
 * @param {number} units
 * @returns {string}
 */
export function formatUnits(units) {
  const fraction = units % 100_000_000;
  const whole = (units - fraction) / 100_000_000;
  const decimals = String(fraction).padStart(8, '0').replace(/0+$/, '');
  return decimals === '' ? String(whole) : whole + '.' + decimals;
}

/**
 * "4 Jan 2026" from a day key: unambiguous in any language.
 *
 * @param {string} dayKey YYYY-MM-DD
 * @returns {string}
 */
export function humanDay(dayKey) {
  const [year, month, day] = dayKey.split('-').map(Number);
  return day + ' ' + MONTHS[month - 1] + ' ' + year;
}

/**
 * A sentence cut to a label: whitespace flattened, an ellipsis when cut.
 *
 * @param {string} text
 * @returns {string}
 */
export function shortLabel(text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= LABEL_CHARS ? flat : flat.slice(0, LABEL_CHARS - 1).trimEnd() + '…';
}

/**
 * A value that may be unknown: `null` is "unknown", never zero.
 *
 * @param {string | number | null} value
 * @param {string} [unit]
 * @returns {string}
 */
export function orUnknown(value, unit = '') {
  return value === null ? 'unknown' : String(value) + unit;
}

/**
 * The lines of an item's content, with the empty ones dropped.
 *
 * @param {(string | null | false | undefined)[]} parts
 * @returns {string}
 */
export function joinLines(parts) {
  return parts.filter((line) => typeof line === 'string' && line !== '').join('\n');
}
