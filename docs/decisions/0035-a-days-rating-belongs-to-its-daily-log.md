# 0035. A day's rating belongs to its daily log

- **Status** accepted, superseded in part by [0037](0037-jarvis-the-check-in-is-the-product.md)
- **Date** 2026-11-11

## Context

Spec #232 closes the loop on a day: one tap says how it went. The rating has
to live somewhere. Three places were open: a Measurement (a typed reading with
an instant), an event (`day.rated`), or a field of the daily log.

## Decision

**`rating` is a field of the daily log**: a whole number from 1 to 5, or
`null` for unrated. It is canonical and not derived.

- Not a Measurement. A measurement is something read at an instant (a weight,
  a waist) and a day can hold many. A day has one rating, and no time.
- Not an event. An event records that something happened in the day; a rating
  is a reading of the day. Setting, changing and clearing it write nothing to
  `events`.
- The scale's bounds are `limits.dayRatingMin` / `limits.dayRatingMax` in
  `personalos.config.js`, not inline.
- One store function, `setDayRating({ date, rating })`, runs inside the
  serialised write (ADR 0011) and touches only that field. It refuses a day
  after today (through `lib/domain/dates.js`) and anything but an integer on
  the scale or `null`. `updateDailyLog` does not take it.
- The route is `PUT /api/days/[date]` with `{ rating }`; `GET` answers with the
  saved rating, which the card re-reads after a refused save. A malformed day key,
  a future day or an invalid value is a 400 that writes nothing.
- **No migration.** Stored logs have no `rating` key; every read fills in
  `null`, so a day never written to and a day written to before this change
  read the same way. Nothing is backfilled.

## Consequences

- Averages and "days rated" are derived from the logs, never stored.
- A rating-only day is a stored log with empty habits, meals and
  measurements. Code that treats "has a log" as "was recorded" must look at
  what is in it (the habits and nutrition derivations already do).
- Moving the rating to another home later is a one-field migration.
