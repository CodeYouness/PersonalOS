/**
 * Google Calendar sync (ticket #31, ADR 0014). Pulls the account's iCal feed
 * into `Appointment` records; never called during a render (ADR 0010) -- only
 * `scripts/sync-calendar.js` calls `sync()`, and only this module reads
 * `env.calendarIcalUrl`.
 *
 * `syncFromIcs` is the testable core: given raw iCal text and a store, it
 * never touches the network, which is what lets the test suite exercise the
 * real write path against a fixture feed instead of a mock standing in for
 * it.
 */

import ical from 'node-ical';

import { limits } from '../../../personalos.config.js';
import { env } from '../../config/env.js';
import { formatTimeInZone, shiftDayKey, toDayKey, today } from '../../domain/dates.js';

export const name = 'google-calendar';

/** @returns {boolean} */
export function isConfigured() {
  return env.calendarIcalUrl !== null;
}

/**
 * @param {string} icsText
 * @param {{ store: typeof import('../../store.js') }} context only `store`
 *   is used -- accepting the full `SyncContext` here would claim a dependency
 *   on `timezone`/`baseCurrency` this module never reads (it goes straight
 *   to `env`/`dates.js`, same as `classify.js` does).
 * @returns {Promise<import('../contract.js').SyncResult>}
 */
export async function syncFromIcs(icsText, context) {
  const { store } = context;
  const parsed = await ical.async.parseICS(icsText);
  const windowStart = today();
  const windowEnd = shiftDayKey(windowStart, limits.calendarWindowDays - 1);
  // .between() takes actual instants, not day keys; pad a day on each side
  // so a timezone offset near midnight cannot exclude a real in-window
  // occurrence -- toDayKey() below is what makes the actual cut, precisely.
  const betweenFrom = new Date(shiftDayKey(windowStart, -1) + 'T00:00:00.000Z');
  const betweenTo = new Date(shiftDayKey(windowEnd, 2) + 'T00:00:00.000Z');

  let written = 0;
  let skipped = 0;
  /** @type {string[]} */
  const warnings = [];
  /** @type {Set<string>} externalIds this run actually wrote */
  const seen = new Set();

  /**
   * @param {string} externalId
   * @param {string} title
   * @param {Date} start
   * @param {Date | null} end
   */
  const upsertOccurrence = async (externalId, title, start, end) => {
    const date = toDayKey(start);
    if (date < windowStart || date > windowEnd) return;
    if (end && toDayKey(end) !== date) {
      skipped += 1;
      warnings.push('skipped multi-day event ' + externalId + ' (' + title + ')');
      return;
    }
    await store.upsertAppointmentByOrigin({
      title: title || 'Untitled event',
      date,
      startTime: formatTime(start),
      endTime: end ? formatTime(end) : null,
      origin: { source: name, externalId, syncedAt: new Date().toISOString() },
    });
    written += 1;
    seen.add(externalId);
  };

  for (const event of Object.values(parsed)) {
    if (event === undefined || event.type !== 'VEVENT') continue;
    const title = textValue(event.summary);

    if (event.datetype === 'date') {
      skipped += 1;
      warnings.push('skipped all-day event ' + event.uid + ' (' + title + ')');
      continue;
    }

    if (event.rrule) {
      // ponytail: no EXDATE / RECURRENCE-ID override handling and no
      // STATUS:CANCELLED check -- a real Google feed can carry both for a
      // single modified or cancelled instance of a series. Add them if a
      // rescheduled or cancelled recurring meeting turns out to matter more
      // than the plain "still weekly" case this covers.
      const durationMs = event.end ? event.end.getTime() - event.start.getTime() : 0;
      for (const occurrenceStart of event.rrule.between(betweenFrom, betweenTo, true)) {
        const occurrenceEnd = durationMs > 0 ? new Date(occurrenceStart.getTime() + durationMs) : null;
        await upsertOccurrence(event.uid + '#' + toDayKey(occurrenceStart), title, occurrenceStart, occurrenceEnd);
      }
      continue;
    }

    await upsertOccurrence(event.uid, title, event.start, event.end ?? null);
  }

  // Only an appointment dated inside the window this run actually asked the
  // source about can be "confirmed missing" -- one that has simply aged into
  // the past, or sits beyond the window, was never this run's question.
  const previouslySynced = (await store.getAppointments()).filter(
    (appointment) =>
      appointment.origin?.source === name && appointment.date >= windowStart && appointment.date <= windowEnd
  );
  for (const appointment of previouslySynced) {
    const externalId = /** @type {{ externalId: string }} */ (appointment.origin).externalId;
    if (seen.has(externalId)) continue;

    const links = await store.getLinks({ from: appointment.id });
    if (appointment.note !== '' || links.length > 0) {
      if (appointment.confirmed) {
        await store.updateAppointment(appointment.id, { confirmed: false });
      }
      warnings.push(
        'kept ' + externalId + ' (' + appointment.id + '), flagged unconfirmed -- source dropped it but it has a note or link'
      );
    } else {
      await store.deleteAppointment(appointment.id);
      warnings.push('deleted ' + externalId + ' (' + appointment.id + ') -- source dropped it, untouched');
    }
  }

  const syncedAt = new Date().toISOString();
  await store.recordEvent({ type: 'appointment.synced', subject: null, payload: { written, skipped } });
  return { written, skipped, warnings, syncedAt };
}

/**
 * node-ical returns a plain string for an unparameterized property, or
 * `{val, params}` when the source attached one (e.g. `SUMMARY;LANGUAGE=it:`).
 *
 * @param {import('node-ical').ParameterValue | undefined} value
 * @returns {string}
 */
function textValue(value) {
  if (value === undefined) return '';
  return typeof value === 'string' ? value : value.val;
}

/**
 * The wall-clock time a user in `env.timezone` would read off this instant.
 * node-ical already resolves a TZID-qualified DTSTART to the correct UTC
 * instant; reading `getUTCHours()` off that would print the UTC hour, not
 * the user's -- off by the zone's offset, same mistake `dates.js` exists to
 * prevent for the date half.
 *
 * @param {Date} instant
 * @returns {string} HH:MM, 24-hour
 */
function formatTime(instant) {
  return formatTimeInZone(instant, env.timezone);
}

/**
 * @param {import('../contract.js').SyncContext} context
 * @returns {Promise<import('../contract.js').SyncResult>}
 */
export async function sync(context) {
  if (env.calendarIcalUrl === null) {
    throw new Error('google-calendar sync ran with no GOOGLE_CALENDAR_ICAL_URL configured');
  }
  const response = await fetch(env.calendarIcalUrl);
  if (!response.ok) {
    throw new Error('failed to fetch the calendar feed: HTTP ' + response.status);
  }
  return syncFromIcs(await response.text(), context);
}

/** @type {import('../contract.js').Integration} */
export const googleCalendarIntegration = { name, kind: 'calendar', isConfigured, sync };

export default googleCalendarIntegration;
