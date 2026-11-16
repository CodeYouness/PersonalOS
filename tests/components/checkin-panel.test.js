/**
 * What the check-in panel on Home draws in each of its states (ADR 0037):
 * today partly answered, one question at a time; yesterday not filled, from
 * today and opened; a past day filled, as its summary; the sheet of every
 * answer; and the lines filed from a note, with done, undone, rejected and
 * failed lines. Static markup of the pure view, plus the stateful panel
 * once, rendered as the server renders it; tapping, saving, undoing and
 * the focus are checked in the browser. The habits are made up.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, replace: () => {} }) }));

const { default: Checkin, CheckinView } = await import('@/components/Checkin.js');
const { CheckinReceipt } = await import('@/components/CheckinReceipt.js');
const { checkinReducer, initialCheckinState } = await import('@/components/checkinReducer.js');

/** Wednesday 7 October 2026, and the week ending on it. */
const TODAY = '2026-10-07';
const YESTERDAY = '2026-10-06';
const FRIDAY = '2026-10-02';
const WEEK_DAYS = ['2026-10-01', FRIDAY, '2026-10-03', '2026-10-04', '2026-10-05', YESTERDAY, TODAY];

const AREAS = [{ key: 'work', label: 'Work' }, { key: 'study', label: 'Study' }, { key: 'projects', label: 'Projects' }];
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

/** @param {object} [over] @returns {any} */
function answers(over = {}) {
  return { mood: null, energy: null, time: null, habits: {}, skips: {}, ...over };
}

/** @param {Record<string, string>} [fills] @returns {any[]} */
function week(fills = {}) {
  return WEEK_DAYS.map((day) => {
    const fill = fills[day] ?? 'filled';
    return { day, fill, answered: fill === 'filled' ? 5 : fill === 'partly' ? 2 : 0, total: 5 };
  });
}

/** @param {string} id @param {string} text @param {object} [over] @returns {any} a receipt line */
function line(id, text, over = {}) {
  return { actionId: id, name: 'habit.set', text, status: 'done', undoable: true, error: null, ...over };
}

/**
 * @param {any} [over] the state's server part
 * @param {(state: any) => any} [then] transitions on top
 * @param {any} [props]
 */
function view(over = {}, then = (state) => state, props = {}) {
  const state = then(initialCheckinState({ day: TODAY, questions: questions(), done: false, answers: answers(), notes: [], week: week(), ...over }));
  return renderToStaticMarkup(
    createElement(CheckinView, {
      state,
      openText: state.openText ?? '',
      switching: false,
      areas: AREAS,
      step: 30,
      max: 1440,
      scale: [1, 2, 3, 4, 5],
      skipReasons: SKIP_REASONS,
      onPick() {},
      onAnswer() {},
      onCount() {},
      onTime() {},
      onType() {},
      onUndo() {},
      onBack() {},
      onNext() {},
      onOpenSheet() {},
      onCloseSheet() {},
      ...props,
    })
  );
}

/** @param {string} html */
const filled = (html) => (html.match(/class="btn-primary/g) ?? []).length;

describe('the week strip', () => {
  const html = view({ week: week({ [YESTERDAY]: 'empty', '2026-10-03': 'partly', [TODAY]: 'partly' }) });

  it('is a group of the seven days ending today, each saying its date and how far it is', () => {
    expect(html).toContain('role="group" aria-label="The last seven days"');
    expect(html.match(/class="checkin-day /g)).toHaveLength(7);
    expect(html).toContain('aria-label="Friday 2 October, filled"');
    expect(html).toContain('aria-label="Saturday 3 October, partly filled"');
    expect(html).toContain('aria-label="Tuesday 6 October, not filled"');
    expect(html).toContain('aria-label="Wednesday 7 October, today, partly filled"');
  });

  it('marks the day shown as pressed and today as the current date', () => {
    expect(html).toMatch(/aria-label="Wednesday 7 October, today, partly filled" aria-pressed="true" aria-current="date"/);
    expect(html).toMatch(/aria-label="Friday 2 October, filled" aria-pressed="false"/);
    expect(html.match(/aria-current="date"/g)).toHaveLength(1);
  });
});

describe('today, partly answered', () => {
  const html = view({ questions: questions({ read: true }), answers: answers({ habits: { read: true } }), week: week({ [TODAY]: 'partly' }) });

  it('says what is left as a status, with a segment per question, the one asked outlined', () => {
    expect(html).toMatch(/<h2[^>]*aria-live="polite"[^>]*>Today · 4 left</);
    expect(html).toContain('aria-valuetext="1 of 5 answered"');
    expect(html.match(/class="checkin-segment/g)).toHaveLength(5);
    expect(html.match(/is-answered/g)).toHaveLength(1);
    expect(html).toContain('class="checkin-segment is-asked"');
  });

  it('asks the first question left, alone: a counter with its stepper, Save and the reasons', () => {
    expect(html).toContain('2 of 5');
    expect(html).toContain('id="checkin-question"');
    expect(html).toMatch(/id="checkin-question"[^>]*>Water</);
    expect(html).toContain('How many today?');
    expect(html).toMatch(/aria-label="Fewer: Water" disabled=""/);
    expect(html).toMatch(/<span class="checkin-count num"[^>]*>0 \/ 8<\/span>/);
    // Nothing to save until the count moves.
    expect(html).toMatch(/aria-label="Save Water" disabled=""/);
    expect(html).toContain('aria-label="Water: Too heavy"');
    expect(html).not.toContain('How did today feel?');
  });

  it('offers Back, Skip for now and the sheet of every answer, and no summary', () => {
    expect(html).toMatch(/<button type="button" class="link-btn"[^>]*>Back</);
    expect(html).toMatch(/<button type="button" class="link-btn"[^>]*>Skip for now</);
    expect(html).toContain('See and change every answer');
    expect(html).not.toContain('checkin-summary');
  });

  it('has one filled button in view', () => {
    expect(filled(html)).toBe(1);
  });

  it('asks a check habit with one Yes, the reasons as the no, each naming the habit', () => {
    const check = view();
    expect(check).toMatch(/id="checkin-question"[^>]*>Read</);
    expect(check).toContain('Done today?');
    expect(check).toMatch(/class="btn-primary checkin-yes" aria-label="Yes: Read" aria-pressed="false">Yes</);
    expect(check).toContain('No, because…');
    for (const reason of SKIP_REASONS) expect(check).toContain('aria-label="Read: ' + reason.label + '"');
    expect(filled(check)).toBe(1);
  });

  it('asks mood and energy with five taps, putting the question for its day', () => {
    const mood = view({ questions: questions({ read: true, water: true }) });
    expect(mood).toMatch(/id="checkin-question"[^>]*>How did today feel\?</);
    expect(mood).toContain('aria-label="Mood"');
    expect(mood.match(/rating-btn/g)).toHaveLength(5);
  });

  it('asks the time with a stepper per area, "Nothing to declare" and Save once something is declared', () => {
    const at = { questions: questions({ read: true, water: true, mood: true, energy: true }) };
    const time = view(at);
    expect(time).toMatch(/id="checkin-question"[^>]*>Where did today&#x27;s time go\?</);
    expect(time.match(/aria-label="(Less|More) (Work|Study|Projects)"/g)).toHaveLength(6);
    expect(time).toContain('Nothing to declare');
    expect(time).toMatch(/class="btn-primary" aria-label="Save time" disabled=""/);
    const declared = view(at, (state) => checkinReducer(state, { type: 'time', area: 'work', minutes: 90 }));
    expect(declared).toContain('1h 30m in all');
    expect(declared).not.toMatch(/aria-label="Save time" disabled=""/);
    // The last one left cannot be skipped.
    expect(time).toMatch(/disabled=""[^>]*>Skip for now</);
  });

  it('says on the card why its answer did not land', () => {
    const html = view({}, (state) => checkinReducer(state, { type: 'failed', questionId: 'habit:read', error: 'Could not reach the server' }));
    expect(html).toMatch(/role="status"[^>]*>Could not reach the server</);
  });

  it('waits, every button, while one answer is sent', () => {
    const html = view({}, (state) => checkinReducer(state, { type: 'submit', questionId: 'habit:read' }));
    expect(html).toMatch(/aria-label="Yes: Read" aria-pressed="false" disabled=""/);
    expect(html).toMatch(/aria-label="Friday 2 October, filled" aria-pressed="false" disabled=""/);
    expect(html).toContain('aria-busy="true"');
  });

  it('shows a question gone back to with its answer chosen, and Next instead of Skip', () => {
    const html = view({ questions: questions({ read: true }), answers: answers({ skips: { read: 'too-heavy' } }) }, (state) => checkinReducer(state, { type: 'back' }));
    expect(html).toContain('1 of 5 · answered');
    expect(html).toMatch(/aria-label="Read: Too heavy" aria-pressed="true"/);
    expect(html).toMatch(/>Next</);
  });
});

describe('yesterday not filled', () => {
  it('is offered from today, quietly, with what is left', () => {
    const html = view({ week: week({ [YESTERDAY]: 'empty', [TODAY]: 'empty' }) });
    expect(html).toContain('class="checkin-banner"');
    expect(html).toContain('Yesterday isn’t filled yet');
    expect(html).toContain(' · 5 left');
    expect(html).toMatch(/class="link-btn"[^>]*>Fill it</);
  });

  it('is not offered when yesterday is filled', () => {
    expect(view()).not.toContain('checkin-banner');
  });

  it('opened, asks its questions for yesterday, not for today', () => {
    const html = view({ day: YESTERDAY, week: week({ [YESTERDAY]: 'empty' }), questions: questions({ read: true, water: true }) });
    expect(html).toMatch(/<h2[^>]*aria-live="polite"[^>]*>Yesterday · 3 left</);
    expect(html).toContain('Tue 6 October');
    expect(html).toMatch(/id="checkin-question"[^>]*>How did yesterday feel\?</);
    expect(html).not.toContain('checkin-banner');
    expect(html).toMatch(/aria-label="Tuesday 6 October, not filled" aria-pressed="true"/);
  });

  it('asks a habit on an older day by its weekday', () => {
    expect(view({ day: FRIDAY })).toContain('Done on Friday?');
  });
});

describe('a past day filled', () => {
  const filledDay = {
    day: FRIDAY,
    questions: questions(ALL),
    done: true,
    answers: answers({ mood: 4, energy: 2, time: { work: 360, projects: 60 }, habits: { water: 8 }, skips: { read: 'too-heavy' } }),
  };
  const html = view(filledDay);

  it('says the day is filled, with every segment answered, and asks nothing', () => {
    expect(html).toMatch(/<h2[^>]*aria-live="polite"[^>]*>Friday is filled</);
    expect(html.match(/is-answered/g)).toHaveLength(5);
    expect(html).not.toContain('id="checkin-question"');
  });

  it('shows how it went: mood, energy, habits kept and time declared', () => {
    expect(html).toContain('aria-label="How Friday went"');
    expect(html).toMatch(/<dt class="caption">Mood<\/dt><dd class="checkin-tile-value num">4<span class="checkin-tile-unit"> \/ 5/);
    expect(html).toMatch(/Energy<\/dt><dd class="checkin-tile-value num">2</);
    expect(html).toMatch(/Habits kept<\/dt><dd class="checkin-tile-value num">1<span class="checkin-tile-unit"> of 2/);
    expect(html).toMatch(/Time declared<\/dt><dd class="checkin-tile-value num">7h</);
  });

  it('splits the time by area in a bar named in words, each part beside its name', () => {
    expect(html).toContain('role="img" aria-label="Time by area: Work 6h, Projects 1h"');
    expect(html.match(/checkin-timebar-part/g)).toHaveLength(2);
    expect(html).toContain('series-1');
    expect(html).toContain('series-2');
  });

  it('lists each habit kept or why not', () => {
    expect(html).toMatch(/is-skipped"><span class="checkin-habit-name">Read<\/span><span class="checkin-habit-state">Skipped: Too heavy</);
    expect(html).toMatch(/is-kept"><span class="checkin-habit-name">Water<\/span><span class="checkin-habit-state">8 of 8</);
  });

  it('offers the note and Edit answers, the note\'s Save the one filled button, and no list of Undo', () => {
    expect(html).toContain('Anything worth noting?');
    expect(html).toMatch(/class="btn-primary" aria-label="Save note" disabled=""/);
    expect(html).toMatch(/class="btn-ghost"[^>]*>Edit answers</);
    expect(html).not.toContain('>Undo<');
    expect(filled(html)).toBe(1);
  });

  it('says "Not declared" for time never declared, and draws no bar', () => {
    const none = view({ ...filledDay, answers: answers({ mood: 4, energy: 2 }) });
    expect(none).toContain('Not declared');
    expect(none).not.toContain('checkin-timebar');
  });

  it('shows the note, and what the small model filed from it with an Undo each', () => {
    const notes = [
      {
        actionId: 'n1',
        entryId: 'journal_1',
        text: 'Went to the gym, 12 on lunch',
        undoable: true,
        filed: [line('d1', 'Spent 12.00 on Eating out', { name: 'expense.record' }), line('d2', 'Book the dentist', { name: 'task.create', status: 'undone', undoable: false })],
      },
    ];
    const withNote = view({ ...filledDay, notes });
    expect(withNote).toContain('Went to the gym, 12 on lunch</blockquote>');
    expect(withNote).toContain('aria-label="Filed from your note"');
    expect(withNote).toContain('aria-label="Undo Spent 12.00 on Eating out"');
    expect(withNote).toContain('<s>Book the dentist</s>');
    // The note itself is taken back from the sheet, not here.
    expect(withNote).not.toContain('Remove this note');
    expect(withNote).toContain('Anything else worth noting?');
  });

  it('says once what was not filed from the last note', () => {
    const refused = { actionId: null, name: 'habit.set', text: 'Not done: no habit with id "gym"', status: 'rejected', undoable: false, error: 'no habit with id "gym"' };
    const html = view(filledDay, (state) => ({ ...state, noteProblems: [refused] }));
    expect(html).toContain('aria-label="Not filed from your note"');
    expect(html).toContain('Not done: no habit with id &quot;gym&quot;');
  });

  it('keeps the note in the box, and says so, when its save failed', () => {
    const html = view(filledDay, (state) =>
      checkinReducer(checkinReducer(state, { type: 'type', text: 'A quiet day' }), { type: 'failed', questionId: 'open', error: 'Could not reach the server' })
    );
    expect(html).toContain('A quiet day</textarea>');
    expect(html).toMatch(/role="status"[^>]*>Could not reach the server. The text is still here.</);
    expect(html).not.toMatch(/aria-label="Save note" disabled=""/);
  });
});

describe('the sheet of every answer', () => {
  const html = view(
    {
      questions: questions({ read: true, mood: true }),
      answers: answers({ habits: { read: true, water: 3 }, mood: 4 }),
      notes: [{ actionId: 'n1', entryId: 'journal_1', text: 'A long day', undoable: true, filed: [] }],
    },
    (state) => checkinReducer(state, { type: 'openSheet' })
  );

  it('replaces the card and shows every question with what the day holds, the open ones said', () => {
    expect(html).not.toContain('id="checkin-question"');
    expect(html).toContain('Today’s answers');
    expect(html).toMatch(/aria-label="Yes: Read" aria-pressed="true"/);
    expect(html).toMatch(/<span class="checkin-count num"[^>]*>3 \/ 8<\/span>/);
    expect(html).toContain('Water<span class="caption"> · not answered</span>');
    expect(html).toMatch(/aria-label="Mood"[\s\S]*?aria-pressed="true"[^>]*>4</);
    expect(html).toContain('Time · not declared');
  });

  it('lets a note be removed, offers another, and closes with Done -- the one filled button', () => {
    expect(html).toContain('A long day</blockquote>');
    expect(html).toContain('aria-label="Remove this note and what was filed from it"');
    expect(html).toContain('Anything else worth noting?');
    expect(html).toMatch(/class="btn-primary"[^>]*>Done</);
    expect(filled(html)).toBe(1);
  });

  it('offers no reason for a counter kept until its count comes down', () => {
    const kept = view({ answers: answers({ habits: { water: 8 } }), questions: questions({ water: true }) }, (state) => checkinReducer(state, { type: 'openSheet' }));
    expect(kept).toMatch(/aria-label="Water: Forgotten" aria-pressed="false" disabled=""/);
    expect(kept).not.toMatch(/aria-label="Read: Forgotten" aria-pressed="false" disabled=""/);
  });

  it('changes a declared day\'s time from what is saved, with no "Nothing to declare"', () => {
    const declared = view({ questions: questions({ time: true }), answers: answers({ time: { work: 120 } }) }, (state) => checkinReducer(state, { type: 'openSheet' }));
    expect(declared).toMatch(/<span class="time-value num">2h</);
    expect(declared).not.toContain('Nothing to declare');
    expect(declared).toMatch(/class="btn-ghost" aria-label="Save time" disabled=""/);
  });
});

describe("the lines filed from a note", () => {
  /** @param {any[]} lines @param {Record<string, string>} [errors] @param {string | null} [pending] */
  function receipt(lines, errors = {}, pending = null) {
    return renderToStaticMarkup(createElement(CheckinReceipt, { lines, errors, pending, onUndo() {} }));
  }

  it('lists the lines in the order given, newest last, under what they are', () => {
    const html = receipt([line('a1', 'Read ticked'), line('a2', 'Mood 4')]);
    expect(html).toContain('Filed from your note');
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
  it('renders the server state it was given, asking the first question left', () => {
    const html = renderToStaticMarkup(
      createElement(Checkin, {
        server: { day: TODAY, questions: questions({ read: true }), done: false, answers: answers({ habits: { read: true } }), notes: [], week: week({ [TODAY]: 'partly' }) },
        areas: AREAS,
        step: 30,
        max: 1440,
        scale: [1, 2, 3, 4, 5],
        skipReasons: SKIP_REASONS,
      })
    );
    expect(html).toMatch(/<h2[^>]*aria-live="polite"[^>]*>Today · 4 left</);
    expect(html).toMatch(/id="checkin-question"[^>]*>Water</);
  });
});
