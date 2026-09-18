/**
 * The Google Calendar sync (ticket #31), tested against fixture iCal text --
 * never a real network call. Runs the real store against a throwaway
 * DATA_DIR, the same sandboxing tests/store/json-adapter.test.js uses, so
 * this exercises the actual write path (upsert, note/link preservation,
 * deletion) rather than a mock standing in for it.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/integrations/google-calendar/index.js')} */
let googleCalendar;
/** @type {typeof import('@/lib/domain/dates.js')} */
let dates;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-calendar-sync-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  store = await import('@/lib/store.js');
  googleCalendar = await import('@/lib/integrations/google-calendar/index.js');
  dates = await import('@/lib/domain/dates.js');
});

afterEach(async () => {
  await store.resetToSeed();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

/**
 * A day key `daysFromToday` days out, as `YYYYMMDD` for an ICS line.
 * @param {number} daysFromToday
 */
function icsDate(daysFromToday) {
  return dates.shiftDayKey(dates.today(), daysFromToday).replaceAll('-', '');
}

/**
 * A real Google export always ships the VTIMEZONE its TZID events refer to;
 * every fixture below includes it and expresses times as wall-clock
 * Europe/Rome (USER_TIMEZONE's default) rather than raw UTC 'Z' instants, so
 * an assertion like `startTime: '10:00'` means what it says regardless of
 * the season the test happens to run in -- no DST offset arithmetic to get
 * wrong in the fixture itself.
 */
const VTIMEZONE_ROME = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Rome',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
].join('\r\n');

/**
 * One VEVENT block, in Europe/Rome wall-clock time via TZID -- see
 * VTIMEZONE_ROME above for why.
 *
 * @param {{ uid: string, summary?: string, daysFromToday?: number, startHour?: number, endHour?: number | null, allDay?: boolean, rrule?: string }} options
 */
function vevent({ uid, summary = 'Untitled', daysFromToday = 1, startHour = 14, endHour = 15, allDay = false, rrule }) {
  if (allDay) {
    const start = icsDate(daysFromToday);
    const end = icsDate(daysFromToday + 1);
    return [
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:' + start,
      'DTEND;VALUE=DATE:' + end,
      'DTSTAMP:20260101T000000Z',
      'UID:' + uid,
      'SUMMARY:' + summary,
      'END:VEVENT',
    ].join('\r\n');
  }

  const day = icsDate(daysFromToday);
  const lines = [
    'BEGIN:VEVENT',
    'DTSTART;TZID=Europe/Rome:' + day + 'T' + String(startHour).padStart(2, '0') + '0000',
  ];
  if (endHour !== null) {
    lines.push('DTEND;TZID=Europe/Rome:' + day + 'T' + String(endHour).padStart(2, '0') + '0000');
  }
  lines.push('DTSTAMP:20260101T000000Z', 'UID:' + uid, 'SUMMARY:' + summary);
  if (rrule) lines.push('RRULE:' + rrule);
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

/** @param {string[]} events */
function feed(events) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', VTIMEZONE_ROME, ...events, 'END:VCALENDAR'].join(
    '\r\n'
  );
}

describe('google calendar sync', () => {
  it('creates an appointment for a plain event in the window', async () => {
    const ics = feed([vevent({ uid: 'evt-1@google.com', summary: 'Dentist', daysFromToday: 1, startHour: 14, endHour: 15 })]);

    const result = await googleCalendar.syncFromIcs(ics, { store });

    const appointments = await store.getAppointments();
    const created = appointments.find((a) => a.origin?.externalId === 'evt-1@google.com');
    expect(created).toBeTruthy();
    expect(created?.title).toBe('Dentist');
    expect(created?.date).toBe(dates.shiftDayKey(dates.today(), 1));
    // TZID-qualified local time read back as that same local time -- a sync
    // that read the UTC hour off the resolved instant instead of formatting
    // it back into the user's zone would be off by Rome's offset from UTC.
    expect(created?.startTime).toBe('14:00');
    expect(created?.endTime).toBe('15:00');
    expect(created?.origin?.source).toBe('google-calendar');
    expect(result.written).toBe(1);
  });

  it('skips an all-day event, logging why, without crashing', async () => {
    const ics = feed([vevent({ uid: 'offsite@google.com', summary: 'Company offsite', allDay: true })]);

    const result = await googleCalendar.syncFromIcs(ics, { store });

    expect((await store.getAppointments()).find((a) => a.origin?.externalId === 'offsite@google.com')).toBeUndefined();
    expect(result.skipped).toBe(1);
    expect(result.warnings.some((w) => w.includes('offsite@google.com'))).toBe(true);
  });

  it('skips a multi-day timed event, logging why', async () => {
    // A conference running 09:00 day 1 to 17:00 day 2 -- a real DTSTART/DTEND
    // pair, just not one `date` + `startTime` can represent.
    const day1 = icsDate(1);
    const day2 = icsDate(2);
    const ics = feed([
      [
        'BEGIN:VEVENT',
        'DTSTART;TZID=Europe/Rome:' + day1 + 'T090000',
        'DTEND;TZID=Europe/Rome:' + day2 + 'T170000',
        'DTSTAMP:20260101T000000Z',
        'UID:conference@google.com',
        'SUMMARY:Conference',
        'END:VEVENT',
      ].join('\r\n'),
    ]);

    const result = await googleCalendar.syncFromIcs(ics, { store });

    expect(
      (await store.getAppointments()).find((a) => a.origin?.externalId === 'conference@google.com')
    ).toBeUndefined();
    expect(result.skipped).toBe(1);
    expect(result.warnings.some((w) => w.includes('conference@google.com'))).toBe(true);
  });

  it('updates the source-owned fields on a second run without duplicating the appointment', async () => {
    const first = feed([vevent({ uid: 'evt-2@google.com', summary: 'Standup', startHour: 9, endHour: 9 })]);
    await googleCalendar.syncFromIcs(first, { store });
    const before = await store.getAppointments();

    // The organizer moved it by 30 minutes and renamed it before the next sync.
    const second = feed([vevent({ uid: 'evt-2@google.com', summary: 'Team standup', startHour: 9, endHour: 10 })]);
    await googleCalendar.syncFromIcs(second, { store });
    const after = await store.getAppointments();

    const updated = after.find((a) => a.origin?.externalId === 'evt-2@google.com');
    expect(updated?.title).toBe('Team standup');
    expect(updated?.endTime).toBe('10:00');
    // Same record, not a second one appended.
    expect(after.filter((a) => a.origin?.externalId === 'evt-2@google.com')).toHaveLength(1);
    expect(after.length).toBe(before.length);
  });

  it('keeps a note the user added across a re-sync', async () => {
    const ics = feed([vevent({ uid: 'evt-3@google.com', summary: 'Dentist' })]);
    await googleCalendar.syncFromIcs(ics, { store });
    const created = (await store.getAppointments()).find((a) => a.origin?.externalId === 'evt-3@google.com');
    await store.updateAppointment(/** @type {string} */ (created?.id), { note: 'ask about the retainer' });

    await googleCalendar.syncFromIcs(ics, { store });

    const resynced = (await store.getAppointments()).find((a) => a.origin?.externalId === 'evt-3@google.com');
    expect(resynced?.note).toBe('ask about the retainer');
  });

  it('deletes an appointment no longer in the feed if the user never touched it', async () => {
    const ics = feed([vevent({ uid: 'evt-4@google.com', summary: 'One-off call' })]);
    await googleCalendar.syncFromIcs(ics, { store });
    expect(
      (await store.getAppointments()).find((a) => a.origin?.externalId === 'evt-4@google.com')
    ).toBeTruthy();

    // The meeting is gone from the calendar on the next sync.
    const result = await googleCalendar.syncFromIcs(feed([]), { store });

    expect(
      (await store.getAppointments()).find((a) => a.origin?.externalId === 'evt-4@google.com')
    ).toBeUndefined();
    expect(result.warnings.some((w) => w.includes('evt-4@google.com'))).toBe(true);
  });

  it('flags, rather than deletes, an appointment the user annotated once the source drops it', async () => {
    const ics = feed([vevent({ uid: 'evt-5@google.com', summary: 'Dentist' })]);
    await googleCalendar.syncFromIcs(ics, { store });
    const created = (await store.getAppointments()).find((a) => a.origin?.externalId === 'evt-5@google.com');
    await store.updateAppointment(/** @type {string} */ (created?.id), { note: 'bring the x-rays' });

    // The dentist cancelled and the event disappeared from the feed.
    await googleCalendar.syncFromIcs(feed([]), { store });

    const kept = (await store.getAppointments()).find((a) => a.origin?.externalId === 'evt-5@google.com');
    expect(kept).toBeTruthy();
    expect(kept?.confirmed).toBe(false);
    expect(kept?.note).toBe('bring the x-rays');
  });

  it('re-confirms a previously flagged appointment once the source mentions it again', async () => {
    const ics = feed([vevent({ uid: 'evt-6@google.com', summary: 'Dentist' })]);
    await googleCalendar.syncFromIcs(ics, { store });
    const created = (await store.getAppointments()).find((a) => a.origin?.externalId === 'evt-6@google.com');
    await store.updateAppointment(/** @type {string} */ (created?.id), { note: 'bring the x-rays' });
    await googleCalendar.syncFromIcs(feed([]), { store });

    // The dentist un-cancels it.
    await googleCalendar.syncFromIcs(ics, { store });

    const reconfirmed = (await store.getAppointments()).find((a) => a.origin?.externalId === 'evt-6@google.com');
    expect(reconfirmed?.confirmed).toBe(true);
  });

  it('leaves an appointment carrying only a link, not a note, flagged rather than deleted', async () => {
    const ics = feed([vevent({ uid: 'evt-7@google.com', summary: 'Dentist' })]);
    await googleCalendar.syncFromIcs(ics, { store });
    const created = (await store.getAppointments()).find((a) => a.origin?.externalId === 'evt-7@google.com');
    const person = await store.createPerson({ name: 'Dr. Bianchi' });
    await store.createLink({ from: /** @type {string} */ (created?.id), to: person.id, rel: 'involves' });

    await googleCalendar.syncFromIcs(feed([]), { store });

    const kept = (await store.getAppointments()).find((a) => a.origin?.externalId === 'evt-7@google.com');
    expect(kept).toBeTruthy();
    expect(kept?.confirmed).toBe(false);
  });

  it('leaves a previously synced appointment alone once it ages out of the window, past or future', async () => {
    // A sync run only speaks for what it actually asked the source about --
    // the current window. An appointment dated outside it was not confirmed
    // missing; it was simply not this run's question to ask, so deleting or
    // flagging it here would be guessing, not syncing.
    const ics = feed([vevent({ uid: 'evt-8@google.com', summary: 'Old meeting' })]);
    await googleCalendar.syncFromIcs(ics, { store });
    const created = /** @type {{ id: string }} */ (
      (await store.getAppointments()).find((a) => a.origin?.externalId === 'evt-8@google.com')
    );
    // The window has since moved past it -- as if this synced a while ago.
    await store.updateAppointment(created.id, { note: '' });
    const past = await store.upsertAppointmentByOrigin({
      title: 'Old meeting',
      date: dates.shiftDayKey(dates.today(), -5),
      startTime: '09:00',
      origin: { source: 'google-calendar', externalId: 'evt-8@google.com', syncedAt: '2020-01-01T00:00:00.000Z' },
    });
    expect(past.date).toBe(dates.shiftDayKey(dates.today(), -5));

    await googleCalendar.syncFromIcs(feed([]), { store });

    expect(await store.getAppointment(past.id)).toEqual(past);
  });

  it('records one appointment.synced event per run, not per appointment', async () => {
    const ics = feed([
      vevent({ uid: 'evt-9@google.com', summary: 'A' }),
      vevent({ uid: 'evt-10@google.com', summary: 'B', daysFromToday: 2 }),
    ]);

    await googleCalendar.syncFromIcs(ics, { store });

    const events = await store.getEvents({ from: dates.today(), to: dates.shiftDayKey(dates.today(), 1) });
    const synced = events.filter((e) => e.type === 'appointment.synced');
    expect(synced).toHaveLength(1);
    expect(synced[0].payload).toMatchObject({ written: 2 });
  });

  it('expands a weekly recurring event into one appointment per occurrence in the window', async () => {
    const ics = feed([
      vevent({ uid: 'standup@google.com', summary: 'Weekly standup', daysFromToday: 0, startHour: 9, endHour: 9, rrule: 'FREQ=WEEKLY' }),
    ]);

    const result = await googleCalendar.syncFromIcs(ics, { store });

    const occurrences = (await store.getAppointments()).filter((a) => a.origin?.source === 'google-calendar');
    // calendarWindowDays is 14 and this recurs weekly starting today, so
    // exactly two occurrences fall inside the window: today and +7 days.
    expect(occurrences).toHaveLength(2);
    expect(occurrences.map((a) => a.date).sort()).toEqual(
      [dates.today(), dates.shiftDayKey(dates.today(), 7)].sort()
    );
    expect(result.written).toBe(2);
  });

  it('throws instead of syncing when no iCal URL is configured, and never calls fetch', async () => {
    // The test environment never sets GOOGLE_CALENDAR_ICAL_URL. sync() is the
    // one real network boundary in this module -- everything else in this
    // file is fixture-driven syncFromIcs(), never a real call.
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      googleCalendar.sync({ store, timezone: 'Europe/Rome', baseCurrency: 'EUR' })
    ).rejects.toThrow(/GOOGLE_CALENDAR_ICAL_URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
