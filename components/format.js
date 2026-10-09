/**
 * Small display-formatting helpers shared across components. Not domain
 * logic -- lib/domain/ stays plain-Node-importable, and initials are a
 * rendering concern, not a rule about what a name means.
 */

import { STREAK_WINDOW_DAYS } from '@/lib/domain/derive/habits.js';

/** @param {string} name */
export function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** @param {string} isoInstant */
export function formatTime(isoInstant) {
  return new Date(isoInstant).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * A day key has no time and no zone (lib/domain/dates.js), so it is parsed
 * as UTC midnight purely to hand a Date to Intl -- this is formatting, not a
 * second "what day is it" computation.
 *
 * @param {string} dayKey
 * @returns {Date}
 */
export function dayKeyToUtcDate(dayKey) {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * A streak as it is shown. The count can only ever look back over the window
 * the logs were read for, so at the window's edge it says "365+" rather than
 * claiming a number it cannot know.
 *
 * @param {number} days
 * @returns {string}
 */
export function streakLabel(days) {
  return days >= STREAK_WINDOW_DAYS ? STREAK_WINDOW_DAYS + '+' : String(days);
}

/**
 * A person as the CRM names them: "Marta Oliveira — Nordis", or the name
 * alone when there is no organization.
 *
 * @param {{ name: string, organization: string }} person
 */
export function personLabel(person) {
  return person.organization ? person.name + ' — ' + person.organization : person.name;
}

/**
 * A task's age on a board ticket: "0d", "3d". Long form in `ageTitle`.
 *
 * @param {number} days
 */
export function ageLabel(days) {
  return days + 'd';
}

/** @param {number} days */
export function ageTitle(days) {
  if (days === 0) return 'Created today';
  return 'Created ' + days + (days === 1 ? ' day' : ' days') + ' ago';
}

/**
 * A count as it is shown: "1,780". One fixed locale, so the server's render
 * and the browser's never disagree about a separator.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatCount(value) {
  return value.toLocaleString('en-GB');
}

/**
 * A weight as a scale shows it: always one decimal, "75.0" -- so a column of
 * weights lines up.
 *
 * @param {number} kg
 * @returns {string}
 */
export function formatWeight(kg) {
  return kg.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * A change as it is shown: "+0.4", "−1.2", "0" -- signed, with a real minus.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatChange(value) {
  return value.toLocaleString('en-GB', { signDisplay: 'exceptZero' }).replace('-', '−');
}

/**
 * A day in a table row: "Mon 5 Jan".
 *
 * @param {string} dayKey
 * @returns {string}
 */
export function dayLabel(dayKey) {
  return dayKeyToUtcDate(dayKey).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const ORDINAL_RULES = new Intl.PluralRules('en-GB', { type: 'ordinal' });
/** @type {Record<string, string>} */
const ORDINAL_SUFFIX = { one: 'st', two: 'nd', few: 'rd', other: 'th' };

/**
 * A count as an English ordinal: "2nd", "11th", "21st".
 *
 * @param {number} count
 * @returns {string}
 */
export function ordinal(count) {
  return count + ORDINAL_SUFFIX[ORDINAL_RULES.select(count)];
}

/**
 * The period a slipped goal is in: "2nd week", "3rd month" (ADR 0021).
 *
 * @param {number} period from lib/domain/derive/goals.js's slippedPeriod
 * @param {'week' | 'month'} horizon
 * @returns {string}
 */
export function slippedLabel(period, horizon) {
  return ordinal(period) + ' ' + horizon;
}

/**
 * A 0..1 ratio as whole percent. One implementation, so the habits ring and
 * a history row's rate can never round the same number differently.
 *
 * @param {number} ratio
 * @returns {string}
 */
export function percent(ratio) {
  return Math.round(ratio * 100) + '%';
}

/**
 * Who made a record, as the provenance line says it: every `SOURCE_KINDS`
 * value but `capture`, which says more (see below).
 *
 * @type {Record<Exclude<import('@/lib/domain/types.js').Task['source'], 'capture'>, string>}
 */
const MADE_BY = {
  user: 'by you',
  seed: 'with the demo data',
  journal: 'from the journal',
  integration: 'by a sync',
  derived: 'by PersonalOS',
};

/**
 * Where a task came from and how it was filed -- the line at the foot of the
 * CRM detail panel. "Created 4 Jan from a capture · filed by the model",
 * "Created 4 Jan by you". The year is added only when it is not this one.
 *
 * @param {{
 *   createdDayKey: string,
 *   source: import('@/lib/domain/types.js').Task['source'],
 *   route: 'model' | 'rules' | null,
 * }} origin
 *   `route` is the producing capture's, when a capture produced it
 * @param {string} todayKey
 * @returns {string}
 */
export function provenanceLabel({ createdDayKey, source, route }, todayKey) {
  const sameYear = createdDayKey.slice(0, 4) === todayKey.slice(0, 4);
  const day = dayKeyToUtcDate(createdDayKey).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
    timeZone: 'UTC',
  });
  if (source === 'capture') {
    const filed = route === null ? '' : ' · filed by ' + (route === 'model' ? 'the model' : 'rules');
    return 'Created ' + day + ' from a capture' + filed;
  }
  return 'Created ' + day + ' ' + MADE_BY[source];
}

const THIN_SPACE = '\u2009';
const MINUS = '−';

/**
 * An amount of money as a table shows it: whole euros, "12,400", or with the
 * cents when asked, "84,320.55". Money is an integer in minor units (ADR
 * 0009), so the euros and cents are split with integer arithmetic and only
 * the grouping is left to Intl -- no float ever holds the amount. Whole
 * euros round half away from zero; a negative amount gets a real minus.
 *
 * @param {number} minor
 * @param {{ cents?: boolean }} [options]
 * @returns {string}
 */
export function formatMoney(minor, { cents = false } = {}) {
  const sign = minor < 0 ? MINUS : '';
  const magnitude = Math.abs(minor);
  if (!cents) return sign + formatCount(Math.floor((magnitude + 50) / 100));
  const fraction = String(magnitude % 100).padStart(2, '0');
  return sign + formatCount(Math.floor(magnitude / 100)) + '.' + fraction;
}

/**
 * A headline amount: "€ 84,320", the sign before the euro.
 *
 * @param {number} minor
 * @param {{ cents?: boolean }} [options]
 * @returns {string}
 */
export function formatEuro(minor, options) {
  const sign = minor < 0 ? MINUS : '';
  return sign + '€' + THIN_SPACE + formatMoney(Math.abs(minor), options);
}

/**
 * A change in money: "+ 2,140", "− 1,905", "0" -- signed, whole euros.
 *
 * @param {number} minor
 * @returns {string}
 */
export function formatMoneyChange(minor) {
  const shown = formatMoney(Math.abs(minor));
  if (shown === '0') return '0';
  return (minor < 0 ? MINUS : '+') + THIN_SPACE + shown;
}

/**
 * A date in a column of dates: "5 Jan", and "30 Jun 2025" when it is not
 * this year -- so a value typed months ago shows its age.
 *
 * @param {string} dayKey
 * @param {string} todayKey
 * @returns {string}
 */
export function shortDate(dayKey, todayKey) {
  return dayKeyToUtcDate(dayKey).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: dayKey.slice(0, 4) === todayKey.slice(0, 4) ? undefined : 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * An amount as typed into a field -- "12,400", "€ 1,234.5", "-500" -- read
 * into minor units. The inverse of formatMoney: euros and cents are taken
 * from the digits as text, so no float ever holds the amount. Commas group
 * thousands; at most two decimals. Null when it is not an amount.
 *
 * @param {string} text
 * @returns {number | null}
 */
export function parseMoney(text) {
  const cleaned = text.replace(/[\s€,]/g, '').replace(MINUS, '-');
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (match === null) return null;
  const [, sign, euros, fraction = ''] = match;
  const minor = Number(euros) * 100 + Number(fraction.padEnd(2, '0'));
  return sign === '-' ? -minor : minor;
}

/** One unit, in the 10^-8 units a trade counts in. */
const UNIT_DIGITS = 8;

/**
 * A number of units as typed -- "10.5", "0.00000001" -- read into the
 * integer count of 10^-8 units a trade stores. Exact: the digits are taken
 * as text, never through a float. Null when it is not a positive amount of
 * units with at most eight decimals.
 *
 * @param {string} text
 * @returns {number | null}
 */
export function parseUnits(text) {
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(text.replace(/[\s,]/g, ''));
  if (match === null) return null;
  const [, whole, fraction = ''] = match;
  return Number(whole) * 10 ** UNIT_DIGITS + Number(fraction.padEnd(UNIT_DIGITS, '0'));
}

/**
 * A count of 10^-8 units as a person reads it: "10.5", "1,000",
 * "0.00000001" -- only the decimals it has.
 *
 * @param {number} units
 * @returns {string}
 */
export function formatUnits(units) {
  const whole = formatCount(Math.floor(units / 10 ** UNIT_DIGITS));
  const fraction = String(units % 10 ** UNIT_DIGITS).padStart(UNIT_DIGITS, '0').replace(/0+$/, '');
  return fraction === '' ? whole : whole + '.' + fraction;
}
