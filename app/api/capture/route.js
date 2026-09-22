import { NextResponse } from 'next/server';

import { classify } from '@/lib/classify.js';
import {
  createAppointment,
  createCapture,
  createGoal,
  createLink,
  createMemoryEntry,
  createTask,
  getPeople,
  recordEvent,
} from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * The one gesture: a sentence in, filed for real. Classify decides a
 * destination; this route writes the capture, a memory entry, the
 * destination record when there is one, the links between them, and an
 * event.
 *
 * Only the capture write is load-bearing. `task`, `goals` and `appointment`
 * get a real destination record; the other four file as capture + memory
 * only, since a fabricated transaction or person would be worse than none,
 * and `docs/domain.md` calls "nothing but a memory entry" a valid outcome,
 * not a shortfall. Everything after the capture is enrichment: if it fails
 * partway, the capture the user just said is still there, which is the
 * floor rule 2 sets -- "capture never fails; at worst it files badly".
 *
 * @param {Request} request
 */
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (text === '') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const { destination, route, fields } = await classify(text);
  const capture = await createCapture({ text, origin: 'bar', destination, route });

  let recordId = null;
  try {
    if (destination === 'task') {
      const task = await createTask({ title: fields.title ?? text, source: 'capture' });
      recordId = task.id;
      await createLink({ from: capture.id, to: task.id, rel: 'about' });
    } else if (destination === 'goals') {
      const goal = await createGoal({ name: fields.title ?? text, source: 'capture' });
      recordId = goal.id;
      await createLink({ from: capture.id, to: goal.id, rel: 'about' });
    } else if (destination === 'appointment') {
      const appointment = await createAppointment({
        title: fields.title ?? text,
        date: fields.date,
        startTime: fields.startTime,
        endTime: fields.endTime ?? null,
        source: 'capture',
      });
      recordId = appointment.id;
      await createLink({ from: capture.id, to: appointment.id, rel: 'about' });
      await recordEvent({ type: 'appointment.created', subject: appointment.id, source: 'capture' });

      const person = (await getPeople()).find((candidate) =>
        new RegExp('\\b' + escapeRegExp(candidate.name) + '\\b', 'i').test(text)
      );
      if (person) {
        await createLink({ from: appointment.id, to: person.id, rel: 'involves' });
      }
    }

    // createMemoryEntry links the memory back to the capture itself
    // (derived_from) -- the provenance a memory must always be able to give.
    await createMemoryEntry({
      type: 'fact',
      content: text,
      source: 'capture',
      derivedFrom: capture.id,
    });
    await recordEvent({ type: 'capture.filed', subject: capture.id, source: 'capture' });
  } catch (error) {
    // The capture already landed above. A card, a link or the event failing
    // after that must not read to the user as the capture having failed --
    // that is exactly the confusing half-state rule 2 exists to prevent.
    console.error('[capture] filed the capture but enrichment failed:', error);
  }

  return NextResponse.json({ destination, route, recordId });
}

/** @param {string} text */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
