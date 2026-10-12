import { NextResponse } from 'next/server';

import { buildContext } from '@/lib/ai/context/index.js';
import { answerQuestion } from '@/lib/answer.js';
import { limits } from '@/personalos.config.js';

export const dynamic = 'force-dynamic';

/**
 * Ask a question of your own data (#172, ADR 0028): the question and every
 * record a screen shows go to the answer module, and what comes back is a
 * set of statements, each with the records it cites. Writes nothing -- no
 * capture, no memory, no event -- and stores neither the question nor the
 * answer. Asked on purpose by the capture bar's Ask mode: the route never
 * decides whether a sentence "is" a question.
 *
 * No model configured is an answer (200), not an error, and nothing
 * rule-based answers in its place; a question the data cannot answer is a
 * 200 too. A model that did not answer is a 502 the screen offers to retry.
 *
 * @param {Request} request
 */
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ status: 'error', message: 'expected a JSON object' }, { status: 400 });
  }
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (question === '') {
    return NextResponse.json({ status: 'error', message: 'question is required' }, { status: 400 });
  }
  if (question.length > limits.questionMaxChars) {
    const message = 'question must be at most ' + limits.questionMaxChars + ' characters';
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }

  const answer = await answerQuestion(question, await buildContext('question'));
  if (answer.outcome === 'failed') {
    return NextResponse.json(
      { status: 'error', outcome: 'failed', message: "The model didn't answer." },
      { status: 502 }
    );
  }
  if (answer.outcome === 'no-model') {
    return NextResponse.json({ ok: true, outcome: 'no-model' });
  }
  if (answer.outcome === 'not-in-data') {
    return NextResponse.json({ ok: true, outcome: 'not-in-data' });
  }
  return NextResponse.json({
    ok: true,
    outcome: 'answer',
    statements: answer.statements,
    leftOut: answer.leftOut,
  });
}
