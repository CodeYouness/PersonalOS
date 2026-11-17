import Checkin from '@/components/Checkin.js';
import { checkinDay, weekDayOrToday } from '@/lib/checkin/day.js';
import { today } from '@/lib/domain/dates.js';
import { DAY_READING_SCALE } from '@/lib/domain/day-readings.js';
import { TIME_AREA_KEYS } from '@/lib/domain/day-time.js';
import { HABIT_SKIP_REASONS, limits, TIME_AREAS } from '@/personalos.config.js';

/** The areas, in order, as the time question offers them. */
const AREAS = TIME_AREA_KEYS.map((key) => ({ key, label: TIME_AREAS[key] }));

/** The skip reasons, in order, as a habit's "No, because…" offers them. */
const SKIP_REASONS = Object.entries(HABIT_SKIP_REASONS).map(([key, label]) => ({ key, label }));

/**
 * The check-in panel, at the top of Home (ADR 0037): one question at a time
 * for a day of the last seven, the strip to pick one, and once the day is
 * filled how it went. It took the place of the Close the day card, whose
 * mood, energy, time, open habits and journal line are its questions now.
 *
 * Server rendered from the store for the day the address names
 * (`?checkin=YYYY-MM-DD`, one of the strip's seven days; anything else is
 * today), through lib/checkin/day.js as GET /api/checkin reads it -- loading
 * it calls no model and no integration (rule 3,
 * tests/lint/checkin-no-model.test.js), and the week strip is derived, never
 * stored (rule 6). Today is lib/domain/dates.js's, in the user's timezone
 * (rule 4). The answering is the client panel's (./Checkin.js).
 *
 * @param {{ day?: string }} props the day asked for in the address, if any
 */
export default async function CheckinPanel({ day }) {
  const todayKey = today();
  const read = await checkinDay(weekDayOrToday(day, todayKey), todayKey);
  return (
    <Checkin
      server={{ day: read.day, questions: read.questions, counted: read.counted, done: read.done, answers: read.answers, notes: read.notes, week: read.week }}
      areas={AREAS}
      step={limits.timeStepMinutes}
      max={limits.timeAreaMaxMinutes}
      scale={DAY_READING_SCALE}
      skipReasons={SKIP_REASONS}
    />
  );
}
