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
