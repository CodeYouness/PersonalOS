import { NextResponse } from 'next/server';

import { answerCheckin, checkinReceipt, questionsFor } from '@/lib/checkin/day.js';
import { isDayKey, today } from '@/lib/domain/dates.js';
import { refuseUnlessAllowed } from '@/lib/phone-gate.js';

export const dynamic = 'force-dynamic';

/** The fields a POST body may name. */
const FIELDS = ['day', 'answers'];

/** The fields each answer names, every one of them. */
const ANSWER_FIELDS = ['questionId', 'value'];

/**
 * @param {string} message
 * @param {number} [status]
 */
function refuse(message, status = 400) {
  return NextResponse.json({ status: 'error', message }, { status });
}

/**
 * The day a request is about: today when none is named. Why it cannot be
 * one -- not a day key, or a day in the future, which has nothing to ask --
 * as the message, or the day.
 *
 * @param {unknown} day
 * @returns {{ day: string, error: null } | { day: null, error: string }}
 */
function dayOf(day) {
  if (day === undefined || day === null) return { day: today(), error: null };
  if (typeof day !== 'string' || !isDayKey(day)) {
    return { day: null, error: 'day must be a day, YYYY-MM-DD, received ' + JSON.stringify(day) };
  }
  if (day > today()) return { day: null, error: 'day must not be in the future, received ' + JSON.stringify(day) };
  return { day, error: null };
}

/**
 * Why a POST body cannot be filed, or null: an object naming only `day` and
 * `answers`, the answers a non-empty list of `{ questionId, value }`. The
 * whole body is checked before anything is written; whether a value fits its
 * question is decided per answer, after the questions are recomputed, and a
 * value that does not is a rejected line, not a 400.
 *
 * @param {unknown} body
 * @returns {string | null}
 */
function bodyProblem(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'the body must be a JSON object';
  const unknown = Object.keys(body).filter((key) => !FIELDS.includes(key));
  if (unknown.length > 0) return 'the body names only ' + FIELDS.join(', ') + ', received ' + unknown.join(', ');
  if ('day' in body && typeof body.day !== 'string') return 'day must be a day, YYYY-MM-DD, or left out for today';
  const answers = /** @type {{ answers?: unknown }} */ (body).answers;
  if (!Array.isArray(answers) || answers.length === 0) return 'answers must be a list of at least one { questionId, value }';
  for (const [index, answer] of answers.entries()) {
    const where = 'answers[' + index + ']';
    if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return where + ' must be { questionId, value }';
    const keys = Object.keys(answer);
    const extra = keys.filter((key) => !ANSWER_FIELDS.includes(key));
    if (extra.length > 0) return where + ' names only questionId and value, received ' + extra.join(', ');
    if (typeof answer.questionId !== 'string' || answer.questionId === '') return where + '.questionId must be a question id';
    if (!('value' in answer)) return where + '.value is required';
  }
  return null;
}

/**
 * The day's check-in (ADR 0037): the questions computed from the store, which
 * are answered, whether the check-in is done, and the day's check-in receipt
 * as kept -- a line per action, undone ones included. `?day=YYYY-MM-DD` asks
 * a past day; a future one is refused. Loading it calls no model and no
 * integration (rule 3), and writes nothing.
 *
 * Gated like the capture routes: the phone will answer the check-in, and the
 * gate is defence in depth for a path `tailscale serve` might expose.
 *
 * @param {Request} request
 */
export async function GET(request) {
  const refused = refuseUnlessAllowed(request);
  if (refused) return refused;

  const { day, error } = dayOf(new URL(request.url).searchParams.get('day'));
  if (day === null) return refuse(error);

  try {
    const [{ questions, done }, receipt] = await Promise.all([questionsFor(day), checkinReceipt(day)]);
    return NextResponse.json({ ok: true, day, questions, done, receipt });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error('[checkin] could not read the check-in for ' + day + ':', message);
    return refuse(message, 500);
  }
}

/**
 * Closed answers to the day's check-in, filed at once through the action
 * registry by rules -- no model, no confirmation (ADR 0037). The body is
 * `{ day?, answers: [{ questionId, value }] }`; the shapes each question
 * takes are lib/checkin/closed.js's. The questions are recomputed from the
 * store, never taken from the client: an answer to a question the day does
 * not ask, a value that does not fit its question and one its action refuses
 * are rejected lines, and the rest are filed all the same.
 *
 * The answer is the day's questions recomputed after the writes, `done`, and
 * two receipts. `receipt` is the lines of this request alone, in the order
 * of its answers -- rejected ones included, which are never kept -- so a
 * screen tells this request's lines apart by the response itself, not by
 * matching ids against the day. `dayReceipt` is the whole day's check-in
 * receipt as kept, the same one GET answers with.
 *
 * @param {Request} request
 */
export async function POST(request) {
  const refused = refuseUnlessAllowed(request);
  if (refused) return refused;

  const body = await request.json().catch(() => null);
  const problem = bodyProblem(body);
  if (problem !== null) return refuse(problem);
  const { day, error } = dayOf(body.day);
  if (day === null) return refuse(error);

  try {
    const receipt = await answerCheckin(day, body.answers);
    const [{ questions, done }, dayReceipt] = await Promise.all([questionsFor(day), checkinReceipt(day)]);
    return NextResponse.json({ ok: true, day, questions, done, receipt, dayReceipt });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error('[checkin] could not file the answers for ' + day + ':', message);
    return refuse(message, 500);
  }
}
