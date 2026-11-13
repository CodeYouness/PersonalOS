import Checkin from '@/components/Checkin.js';
import { checkinReceipt, questionsFor } from '@/lib/checkin/day.js';
import { today } from '@/lib/domain/dates.js';
import { DAY_READING_SCALE } from '@/lib/domain/day-readings.js';
import { TIME_AREA_KEYS } from '@/lib/domain/day-time.js';
import { getDailyLog } from '@/lib/store.js';
import { HABIT_SKIP_REASONS, limits, TIME_AREAS } from '@/personalos.config.js';

/** The areas, in order, as the time row offers them. */
const AREAS = TIME_AREA_KEYS.map((key) => ({ key, label: TIME_AREAS[key] }));

/** The skip reasons, in order, as a habit's Skip offers them. */
const SKIP_REASONS = Object.entries(HABIT_SKIP_REASONS).map(([key, label]) => ({ key, label }));

/**
 * The check-in panel, at the top of Home (ADR 0037): today's questions, each
 * answered in a tap and filed at once, and the day's receipt to correct them
 * by. It took the place of the Close the day card, whose mood, energy, time,
 * open habits and journal line are its questions now.
 *
 * Server rendered from the store, through lib/checkin/day.js as GET
 * /api/checkin reads it -- loading it calls no model and no integration
 * (rule 3, tests/lint/checkin-no-model.test.js). The day's habit values come
 * with it, so a counter steps from the count it has. The answering is
 * the client panel's (./Checkin.js).
 */
export default async function CheckinPanel() {
  const day = today();
  const [{ questions, done }, receipt, log] = await Promise.all([questionsFor(day), checkinReceipt(day), getDailyLog(day)]);
  return (
    <Checkin
      day={day}
      questions={questions}
      done={done}
      lines={receipt.lines}
      values={log.habits}
      areas={AREAS}
      step={limits.timeStepMinutes}
      max={limits.timeAreaMaxMinutes}
      scale={DAY_READING_SCALE}
      skipReasons={SKIP_REASONS}
    />
  );
}
