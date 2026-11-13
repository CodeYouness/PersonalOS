/**
 * What the check-in panel on Home draws in each of its states (ADR 0037): a
 * fresh day, one partly answered, one with only the open question left, one
 * done, and its receipt with done, undone, rejected and failed lines. Static
 * markup of the pure view, plus the stateful panel once, rendered as the
 * server renders it; tapping, saving and undoing are checked in the browser.
 * The habits are made up.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const { default: Checkin, CheckinView } = await import('@/components/Checkin.js');
const { CheckinReceipt } = await import('@/components/CheckinReceipt.js');
const { checkinReducer, initialCheckinState } = await import('@/components/checkinReducer.js');

const DAY = '2026-10-07';
const AREAS = [{ key: 'work', label: 'Work' }, { key: 'study', label: 'Study' }];
const SKIP_REASONS = [
  { key: 'forgotten', label: 'Forgotten' },
  { key: 'too-heavy', label: 'Too heavy' },
  { key: 'on-purpose', label: 'Skipped on purpose' },
  { key: 'paused', label: 'Paused' },
];

/** @param {string} id @param {string} label @param {boolean} answered @param {object} [over] */
function habit(id, label, answered, over = {}) {
  return { id: 'habit:' + id, kind: 'habit', subjectId: id, label, answered, habitType: 'check', target: null, ...over };
}

/**
 * @param {Record<string, boolean>} [answered]
 * @returns {any[]} the day's questions, as checkinQuestions gives them
 */
function questions(answered = {}) {
  const a = { read: false, water: false, mood: false, energy: false, time: false, ...answered };
  return [
    habit('read', 'Read', a.read),
    habit('water', 'Water', a.water, { habitType: 'counter', target: 8 }),
    { id: 'mood', kind: 'mood', label: 'How did today feel?', answered: a.mood },
    { id: 'energy', kind: 'energy', label: 'How much energy did today have?', answered: a.energy },
    { id: 'time', kind: 'time', label: "Where did today's time go?", answered: a.time },
    { id: 'open', kind: 'open', label: 'Anything worth noting today?', answered: false },
  ];
}

const ALL = { read: true, water: true, mood: true, energy: true, time: true };

/**
 * @param {string} id
 * @param {string} text
 * @param {object} [over]
 * @returns {any} a receipt line
 */
function line(id, text, over = {}) {
  return { actionId: id, name: 'habit.set', text, status: 'done', undoable: true, error: null, ...over };
}

/**
 * @param {any} [over] the state's server part
 * @param {(state: any) => any} [then] transitions on top
 * @param {any} [props]
 */
function view(over = {}, then = (state) => state, props = {}) {
  const state = then(initialCheckinState({ questions: questions(), done: false, lines: [], values: {}, ...over }));
  return renderToStaticMarkup(
    createElement(CheckinView, {
      day: DAY,
      state,
      openText: state.openText ?? '',
      areas: AREAS,
      step: 30,
      max: 1440,
      scale: [1, 2, 3, 4, 5],
      skipReasons: SKIP_REASONS,
      onAnswer() {},
      onToggleSkip() {},
      onCount() {},
      onTime() {},
      onType() {},
      onUndo() {},
      ...props,
    })
  );
}

describe('the check-in panel on a fresh day', () => {
  const html = view();

  it('says what it is, the day, and how far it is, as a status', () => {
    expect(html).toContain('id="card-checkin"');
    expect(html).toContain('Check-in');
    expect(html).toContain('Wed 7 October');
    expect(html).toMatch(/role="status"[^>]*>0 of 5 answered</);
  });

  it('asks every habit by its label, with Done and a Skip that names it', () => {
    expect(html).toContain('Read');
    expect(html).toContain('aria-label="Done: Read"');
    expect(html).toContain('aria-label="Skip Read…"');
    expect(html).toContain('aria-expanded="false"');
    // The reasons wait for Skip.
    expect(html).not.toContain('Too heavy');
  });

  it('steps a counter to its target, from nothing', () => {
    expect(html).toContain('aria-label="Fewer Water"');
    expect(html).toContain('aria-label="More Water"');
    expect(html).toMatch(/aria-label="Fewer Water" disabled=""/);
    expect(html).toMatch(/<span class="checkin-count num">0 \/ 8<\/span>/);
    expect(html).toContain('aria-label="Done: Water"');
    // Nothing to save until the count moves.
    expect(html).not.toContain('aria-label="Save Water"');
  });

  it('asks the mood and the energy, each with its own five taps', () => {
    expect(html).toContain('How did today feel?');
    expect(html).toContain('aria-label="Mood"');
    expect(html).toContain('aria-label="Energy"');
    expect(html.match(/rating-btn/g)).toHaveLength(10);
  });

  it('offers a half-hour stepper per area, "Nothing to declare", and Save time once something is declared', () => {
    expect(html).toContain('aria-label="Less Work"');
    expect(html).toContain('aria-label="More Study"');
    expect(html.match(/aria-label="(Less|More) (Work|Study)"/g)).toHaveLength(4);
    expect(html).toContain('Nothing to declare');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save time</);
    const declared = view({}, (state) => checkinReducer(state, { type: 'time', area: 'work', minutes: 90 }));
    expect(declared).toMatch(/<span class="time-value num">1h 30m</);
    expect(declared).toContain('1h 30m to save');
    // An area at nothing cannot go lower; one with time can.
    expect(declared).toMatch(/aria-label="Less Study" disabled=""/);
    expect(declared).not.toMatch(/aria-label="Less Work" disabled=""/);
    expect(declared).not.toMatch(/<button[^>]*disabled=""[^>]*>Save time</);
  });

  it('ends with the open question, its Save off while the box is empty', () => {
    expect(html).toContain('aria-label="Anything worth noting today?"');
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Save</);
    expect(view({}, (state) => checkinReducer(state, { type: 'type', text: '   ' }))).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Save</);
  });

  it('shows no receipt before anything is filed', () => {
    expect(html).not.toContain('checkin-receipt');
  });
});

describe('the check-in panel partly answered', () => {
  it('leaves the answered questions out and counts them', () => {
    const html = view({ questions: questions({ read: true, mood: true }), values: { read: true } });
    expect(html).toMatch(/role="status"[^>]*>2 of 5 answered</);
    expect(html).not.toContain('aria-label="Done: Read"');
    expect(html).not.toContain('aria-label="Mood"');
    expect(html).toContain('aria-label="Energy"');
  });

  it('shows the four skip reasons of the habit whose Skip was pressed, each naming it', () => {
    const html = view({}, (state) => checkinReducer(state, { type: 'toggleSkip', questionId: 'habit:read' }));
    expect(html).toContain('aria-expanded="true"');
    for (const reason of SKIP_REASONS) expect(html).toContain('aria-label="Read: ' + reason.label + '"');
    expect(html).not.toContain('aria-label="Water: Forgotten"');
  });

  it('starts a counter from its saved count, and offers Save once it moves', () => {
    const saved = view({ values: { water: 3 } });
    expect(saved).toMatch(/checkin-count num">3 \/ 8</);
    const moved = view({ values: { water: 3 } }, (state) => checkinReducer(state, { type: 'count', questionId: 'habit:water', value: 8 }));
    expect(moved).toContain('aria-label="Save Water"');
    expect(moved).toMatch(/aria-label="More Water" disabled=""/);
  });

  it('says in the row why its answer did not land', () => {
    const html = view({}, (state) => checkinReducer(state, { type: 'failed', questionId: 'energy', error: 'Could not reach the server' }));
    expect(html).toMatch(/role="status"[^>]*>Could not reach the server</);
  });

  it('keeps the open answer in the box, and says so, when its save failed', () => {
    const html = view({}, (state) =>
      checkinReducer(checkinReducer(state, { type: 'type', text: 'A quiet day' }), { type: 'failed', questionId: 'open', error: 'Could not reach the server' })
    );
    expect(html).toContain('A quiet day</textarea>');
    expect(html).toMatch(/role="status"[^>]*>Could not reach the server. The text is still here.</);
    expect(html).not.toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Save</);
  });

  it('waits, every button, while one answer is sent', () => {
    const html = view({}, (state) => checkinReducer(state, { type: 'submit', questionId: 'mood' }));
    expect(html).toMatch(/aria-label="Done: Read" disabled=""/);
    expect(html).toMatch(/aria-pressed="false" disabled=""/);
  });
});

describe('the check-in panel with only the open question left', () => {
  const lines = [line('a1', 'Read ticked'), line('a2', 'Mood 4', { name: 'mood.set' })];
  const html = view({ questions: questions(ALL), done: true, lines });

  it('says the day is done, and asks nothing but the open question', () => {
    expect(html).toMatch(/role="status"[^>]*>Done for today</);
    expect(html).not.toContain('checkin-rows');
    expect(html).not.toContain('rating-btn');
    expect(html).not.toContain('time-step-btn');
    expect(html).toContain('aria-label="Anything worth noting today?"');
  });

  it('collapses to the receipt and the open box', () => {
    expect(html).toContain('checkin-receipt');
    expect(html).toContain('Read ticked');
    expect(html).toContain('Mood 4');
  });

  it('does not call the day done while a question is open, even with only one left', () => {
    const one = view({ questions: questions({ ...ALL, time: false }), done: false });
    expect(one).toMatch(/role="status"[^>]*>4 of 5 answered</);
    expect(one).toContain('Nothing to declare');
  });
});

describe("the check-in's receipt", () => {
  /** @param {any[]} lines @param {Record<string, string>} [errors] @param {string | null} [pending] */
  function receipt(lines, errors = {}, pending = null) {
    return renderToStaticMarkup(createElement(CheckinReceipt, { lines, errors, pending, onUndo() {} }));
  }

  it('lists the lines in the order given, newest last', () => {
    const html = receipt([line('a1', 'Read ticked'), line('a2', 'Mood 4')]);
    expect(html.indexOf('Read ticked')).toBeLessThan(html.indexOf('Mood 4'));
  });

  it('offers Undo on a done line that can still be undone, naming it', () => {
    const html = receipt([line('a1', 'Read ticked'), line('a2', 'Work 1h', { undoable: false })]);
    expect(html).toContain('aria-label="Undo Read ticked"');
    expect(html).not.toContain('aria-label="Undo Work 1h"');
    expect(html.match(/>Undo</g)).toHaveLength(1);
  });

  it('strikes an undone line through, with no Undo', () => {
    const html = receipt([line('a1', 'Read ticked', { status: 'undone', undoable: false })]);
    expect(html).toContain('<s>Read ticked</s>');
    expect(html).toContain('Undone');
    expect(html).not.toContain('>Undo<');
  });

  it('shows a rejected line with its reason, once', () => {
    const rejected = { actionId: null, name: '', text: 'Not done: mood: out of range', status: 'rejected', undoable: false, error: 'mood: out of range' };
    const html = receipt([rejected]);
    expect(html).toContain('Not done: mood: out of range');
    expect(html.match(/out of range/g)).toHaveLength(1);
    expect(html).toContain('is-rejected');
  });

  it('shows a failed line with its error, as a status', () => {
    const html = receipt([line('a3', 'Water 8 of 8', { status: 'failed', undoable: false, error: 'no habit water' })]);
    expect(html).toContain('Water 8 of 8');
    expect(html).toMatch(/role="status"[^>]*>no habit water</);
    expect(html).toContain('is-failed');
  });

  it("says why an undo was refused, in the server's words", () => {
    const html = receipt([line('a1', 'Read ticked')], { a1: 'what this action wrote has been changed since' });
    expect(html).toMatch(/role="status"[^>]*>what this action wrote has been changed since</);
  });

  it('waits while a line is being undone', () => {
    expect(receipt([line('a1', 'Read ticked')], {}, 'undo:a1')).toMatch(/aria-label="Undo Read ticked" disabled=""/);
  });
});

describe('the stateful check-in panel', () => {
  it('renders the server state it was given, with an empty open box before the browser draft is read', () => {
    const html = renderToStaticMarkup(
      createElement(Checkin, {
        day: DAY,
        questions: questions({ read: true }),
        done: false,
        lines: [line('a1', 'Read ticked')],
        values: { read: true },
        areas: AREAS,
        step: 30,
        max: 1440,
        scale: [1, 2, 3, 4, 5],
        skipReasons: SKIP_REASONS,
      })
    );
    expect(html).toMatch(/role="status"[^>]*>1 of 5 answered</);
    expect(html).toContain('aria-label="Undo Read ticked"');
    expect(html).toContain('></textarea>');
  });
});
