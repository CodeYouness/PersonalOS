/**
 * The check-in panel's state transitions (ADR 0037), without a DOM. The panel
 * shows the server's state -- what GET or POST /api/checkin answered, or what
 * the page was rendered with -- never its own memory of what it sent; what it
 * keeps itself is only what has not been sent yet -- a counter's count, the
 * time being declared, the note being typed -- where you are in the day,
 * and why a request failed.
 */

import { describe, expect, it } from 'vitest';

import {
  canGoBack,
  canGoOn,
  checkinReducer,
  counterValue,
  currentQuestion,
  initialCheckinState,
  progress,
  timeChanges,
  todayOf,
  yesterdayOpen,
} from '@/components/checkinReducer.js';

const TODAY = '2026-10-07';
const YESTERDAY = '2026-10-06';
const WEEK_DAYS = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', YESTERDAY, TODAY];

/** @param {string} id @param {boolean} answered @param {object} [over] */
function habit(id, answered, over = {}) {
  return { id: 'habit:' + id, kind: 'habit', subjectId: id, label: id, answered, habitType: 'check', target: null, ...over };
}

/**
 * @param {object} [answered] which questions are answered
 * @returns {any[]} the day's questions, as checkinQuestions gives them
 */
function questionsWith(answered = {}) {
  const a = { read: false, water: false, mood: false, energy: false, time: false, ...answered };
  return [
    habit('read', a.read),
    habit('water', a.water, { habitType: 'counter', target: 8 }),
    { id: 'mood', kind: 'mood', label: 'How did today feel?', answered: a.mood },
    { id: 'energy', kind: 'energy', label: 'How much energy did today have?', answered: a.energy },
    { id: 'time', kind: 'time', label: "Where did today's time go?", answered: a.time },
    { id: 'open', kind: 'open', label: 'Anything worth noting today?', answered: false },
  ];
}

const ALL = { read: true, water: true, mood: true, energy: true, time: true };

/** @param {object} [over] @returns {any} what the day was answered with */
function answers(over = {}) {
  return { mood: null, energy: null, time: null, habits: {}, skips: {}, ...over };
}

/**
 * @param {Record<string, string>} [fills] by day
 * @returns {any[]} the week strip
 */
function week(fills = {}) {
  return WEEK_DAYS.map((day) => ({ day, fill: fills[day] ?? 'filled', answered: 5, total: 5 }));
}

/** @param {string} id @param {string} text @param {object} [over] @returns {any} */
function line(id, text, over = {}) {
  return { actionId: id, name: 'habit.set', text, status: 'done', undoable: true, error: null, ...over };
}

/** @param {object} [over] @returns {any} the server's part of the state */
function server(over = {}) {
  return { day: TODAY, questions: questionsWith(), done: false, answers: answers(), notes: [], week: week(), ...over };
}

/** @param {object} [over] */
function fresh(over = {}) {
  return initialCheckinState(server(over));
}

/**
 * What POST /api/checkin answers.
 *
 * @param {any[]} lines this request's lines
 * @param {object} [over] the day after the writes
 * @returns {any}
 */
function response(lines, over = {}) {
  const day = server(over);
  const done = day.questions.every((/** @type {any} */ question) => question.answered || question.kind === 'open');
  return { ...day, done, receipt: { lines } };
}

/** @param {any} state */
const shownId = (state) => currentQuestion(state)?.id ?? null;

describe('the check-in panel state', () => {
  it('starts from what the server rendered, with nothing pending, nothing typed and the sheet closed', () => {
    const state = fresh();
    expect(state.pending).toBeNull();
    expect(state.errors).toEqual({});
    expect(state.openText).toBeNull();
    expect(state.sheet).toBe(false);
    expect(shownId(state)).toBe('habit:read');
  });

  it('counts progress, and what is left, over every question but the open one', () => {
    expect(progress(fresh())).toEqual({ answered: 0, total: 5, left: 5, done: false });
    const partly = fresh({ questions: questionsWith({ read: true, mood: true, energy: true }) });
    expect(progress(partly)).toEqual({ answered: 3, total: 5, left: 2, done: false });
  });

  it('shows no question once the day is done: the summary shows', () => {
    const state = fresh({ questions: questionsWith(ALL), done: true });
    expect(currentQuestion(state)).toBeNull();
    expect(progress(state)).toEqual({ answered: 5, total: 5, left: 0, done: true });
  });

  it('marks the panel pending while an answer is sent, and clears that question\'s old error', () => {
    let state = checkinReducer(fresh(), { type: 'failed', questionId: 'mood', error: 'Could not reach the server' });
    state = checkinReducer(state, { type: 'submit', questionId: 'mood' });
    expect(state.pending).toBe('mood');
    expect(state.errors.mood).toBeUndefined();
  });

  it('a failed request says so for its question and changes nothing else', () => {
    const before = checkinReducer(fresh(), { type: 'type', text: 'A quiet day' });
    let state = checkinReducer(before, { type: 'submit', questionId: 'open' });
    state = checkinReducer(state, { type: 'failed', questionId: 'open', error: 'Could not reach the server' });
    expect(state.pending).toBeNull();
    expect(state.errors.open).toBe('Could not reach the server');
    expect(state.openText).toBe('A quiet day');
    expect(state.questions).toBe(before.questions);
  });
});

describe('one question at a time', () => {
  it('moves on to the next question left once an answer lands, from what the server answered', () => {
    let state = checkinReducer(fresh(), { type: 'submit', questionId: 'habit:read' });
    state = checkinReducer(state, {
      type: 'answered',
      questionId: 'habit:read',
      response: response([line('a1', 'read ticked')], { questions: questionsWith({ read: true }), answers: answers({ habits: { read: true } }) }),
    });
    expect(state.pending).toBeNull();
    expect(shownId(state)).toBe('habit:water');
    expect(state.answers.habits).toEqual({ read: true });
  });

  it('does not move on when the server answered without the question answered: the card says why', () => {
    const rejected = { actionId: null, name: '', text: 'Not done: mood: out of range', status: 'rejected', undoable: false, error: 'mood: out of range' };
    const at = checkinReducer(fresh({ questions: questionsWith({ read: true, water: true }) }), { type: 'submit', questionId: 'mood' });
    const state = checkinReducer(at, { type: 'answered', questionId: 'mood', response: response([rejected], { questions: questionsWith({ read: true, water: true }) }) });
    expect(shownId(state)).toBe('mood');
    expect(state.errors.mood).toBe('mood: out of range');
  });

  it('says a failed action for its question, though the day keeps a record of it', () => {
    const failed = line('a2', 'read ticked', { status: 'failed', undoable: false, error: 'no habit read' });
    let state = checkinReducer(fresh(), { type: 'submit', questionId: 'habit:read' });
    state = checkinReducer(state, { type: 'answered', questionId: 'habit:read', response: response([failed]) });
    expect(state.errors['habit:read']).toBe('no habit read');
  });

  it('goes back to the question before, answered or not, and on again with Next', () => {
    let state = fresh({ questions: questionsWith({ read: true, water: true }) });
    expect(shownId(state)).toBe('mood');
    expect(canGoBack(state)).toBe(true);
    state = checkinReducer(state, { type: 'back' });
    expect(shownId(state)).toBe('habit:water');
    state = checkinReducer(state, { type: 'back' });
    expect(shownId(state)).toBe('habit:read');
    expect(canGoBack(state)).toBe(false);
    expect(checkinReducer(state, { type: 'back' })).toBe(state);
    // Next walks forward; past the answered ones it is the first left again.
    state = checkinReducer(state, { type: 'next' });
    expect(shownId(state)).toBe('habit:water');
    state = checkinReducer(state, { type: 'next' });
    expect(shownId(state)).toBe('mood');
  });

  it('comes back to the first question left after an answer given to one gone back to', () => {
    let state = checkinReducer(fresh({ questions: questionsWith({ read: true }) }), { type: 'back' });
    expect(shownId(state)).toBe('habit:read');
    state = checkinReducer(state, {
      type: 'answered',
      questionId: 'habit:read',
      response: response([line('a3', 'read: Forgotten', { name: 'habit.skip' })], { questions: questionsWith({ read: true }) }),
    });
    expect(state.cursor).toBeNull();
    expect(shownId(state)).toBe('habit:water');
  });

  it('sets a question aside for now and goes round those set aside when nothing else is left', () => {
    let state = fresh({ questions: questionsWith({ read: true, water: true, mood: true }) });
    expect(shownId(state)).toBe('energy');
    expect(canGoOn(state)).toBe(true);
    state = checkinReducer(state, { type: 'next' });
    expect(shownId(state)).toBe('time');
    state = checkinReducer(state, { type: 'next' });
    expect(shownId(state)).toBe('energy');
    state = checkinReducer(state, { type: 'next' });
    expect(shownId(state)).toBe('time');
  });

  it('cannot skip the last question left', () => {
    const state = fresh({ questions: questionsWith({ read: true, water: true, mood: true, energy: true }) });
    expect(shownId(state)).toBe('time');
    expect(canGoOn(state)).toBe(false);
  });
});

describe('days', () => {
  it('reads today off the week the server answered', () => {
    expect(todayOf(fresh())).toBe(TODAY);
  });

  it('offers yesterday while today is shown and yesterday is not filled, partly or not at all', () => {
    expect(yesterdayOpen(fresh({ week: week({ [YESTERDAY]: 'empty' }) }))?.day).toBe(YESTERDAY);
    expect(yesterdayOpen(fresh({ week: week({ [YESTERDAY]: 'partly' }) }))?.day).toBe(YESTERDAY);
    expect(yesterdayOpen(fresh())).toBeNull();
    // Not while yesterday is the day shown, nor for an older day left open.
    expect(yesterdayOpen(fresh({ day: YESTERDAY, week: week({ [YESTERDAY]: 'empty' }) }))).toBeNull();
    expect(yesterdayOpen(fresh({ week: week({ '2026-10-03': 'empty' }) }))).toBeNull();
  });

  it('starts another day clean: nothing stepped, typed, set aside or open carries over', () => {
    let state = checkinReducer(fresh(), { type: 'count', questionId: 'habit:water', value: 4 });
    state = checkinReducer(state, { type: 'time', area: 'work', minutes: 60 });
    state = checkinReducer(state, { type: 'type', text: 'About today' });
    state = checkinReducer(state, { type: 'next' });
    state = checkinReducer(state, { type: 'openSheet' });
    state = checkinReducer(state, { type: 'failed', questionId: 'mood', error: 'Could not reach the server' });

    state = checkinReducer(state, { type: 'loaded', ...server({ day: YESTERDAY, questions: questionsWith({ mood: true }), answers: answers({ mood: 3 }) }) });

    expect(state.day).toBe(YESTERDAY);
    expect(state.answers.mood).toBe(3);
    expect([state.counts, state.time, state.openText, state.aside, state.sheet, state.errors]).toEqual([{}, null, null, [], false, {}]);
    expect(shownId(state)).toBe('habit:read');
  });

  it('follows the page when the same day is re-read -- a habit ticked on another card is answered', () => {
    const typed = checkinReducer(fresh(), { type: 'type', text: 'Half written' });
    const pending = checkinReducer(typed, { type: 'submit', questionId: 'mood' });
    const state = checkinReducer(pending, { type: 'loaded', ...server({ questions: questionsWith({ read: true }), answers: answers({ habits: { read: true } }) }) });
    expect(shownId(state)).toBe('habit:water');
    expect(state.answers.habits).toEqual({ read: true });
    // What is being typed, and the request still running, are the panel's own.
    expect(state.openText).toBe('Half written');
    expect(state.pending).toBe('mood');
  });
});

describe('drafts', () => {
  it('steps a counter from its saved count, between nothing and its target', () => {
    const question = questionsWith()[1];
    let state = fresh({ answers: answers({ habits: { water: 3 } }) });
    expect(counterValue(state, question)).toBe(3);
    state = checkinReducer(state, { type: 'count', questionId: 'habit:water', value: 4 });
    expect(counterValue(state, question)).toBe(4);
    state = checkinReducer(state, { type: 'count', questionId: 'habit:water', value: 9 });
    expect(counterValue(state, question)).toBe(8);
    state = checkinReducer(state, { type: 'count', questionId: 'habit:water', value: -1 });
    expect(counterValue(state, question)).toBe(0);
    expect(counterValue(fresh(), question)).toBe(0);
  });

  it('drops a sent count once the day has it saved', () => {
    const question = questionsWith()[1];
    let state = checkinReducer(fresh({ answers: answers({ habits: { water: 3 } }) }), { type: 'count', questionId: 'habit:water', value: 5 });
    state = checkinReducer(state, { type: 'answered', questionId: 'habit:water', response: response([line('a5', 'water 5')], { answers: answers({ habits: { water: 5 } }) }) });
    expect(state.counts).toEqual({});
    expect(counterValue(state, question)).toBe(5);
  });

  it('declares time per area as a draft, dropping an area brought back to nothing, and sends only what has time', () => {
    let state = checkinReducer(fresh(), { type: 'time', area: 'work', minutes: 60 });
    state = checkinReducer(state, { type: 'time', area: 'refereeing', minutes: 30 });
    state = checkinReducer(state, { type: 'time', area: 'refereeing', minutes: 0 });
    expect(state.time).toEqual({ work: 60 });
    expect(timeChanges(state)).toEqual({ work: 60 });
    state = checkinReducer(state, {
      type: 'answered',
      questionId: 'time',
      response: response([line('a6', 'Work 1h', { name: 'time.set' })], { questions: questionsWith({ time: true }), answers: answers({ time: { work: 60 } }) }),
    });
    expect(state.time).toBeNull();
    expect(timeChanges(state)).toEqual({});
  });

  it('changes a declared day\'s time from what is saved, an area taken to nothing sent as 0', () => {
    let state = fresh({ questions: questionsWith({ time: true }), answers: answers({ time: { work: 240, refereeing: 60 } }) });
    expect(timeChanges(state)).toEqual({});
    state = checkinReducer(state, { type: 'time', area: 'refereeing', minutes: 0 });
    state = checkinReducer(state, { type: 'time', area: 'projects', minutes: 30 });
    expect(state.time).toEqual({ work: 240, projects: 30 });
    expect(timeChanges(state)).toEqual({ refereeing: 0, projects: 30 });
  });

  it('empties the note box once its entry is kept, and says once what was not filed from it', () => {
    const typed = checkinReducer(fresh(), { type: 'type', text: 'Gym, and 12 on lunch' });
    const refused = line('', 'Not done: no habit with id "gym"', { actionId: null, status: 'rejected', undoable: false, error: 'no habit with id "gym"' });
    const saved = checkinReducer(typed, {
      type: 'answered',
      questionId: 'open',
      response: response([line('a7', 'Journal entry added', { name: 'journal.add' }), line('a8', 'Spent 12.00', { name: 'expense.record' }), refused]),
    });
    expect(saved.openText).toBe('');
    expect(saved.errors.open).toBeUndefined();
    expect(saved.noteProblems).toEqual([refused]);
    // The next request starts clean.
    expect(checkinReducer(saved, { type: 'submit', questionId: 'mood' }).noteProblems).toEqual([]);
  });

  it('keeps the note in the box when its entry was not kept', () => {
    const typed = checkinReducer(fresh(), { type: 'type', text: 'A quiet day' });
    const rejected = { actionId: null, name: 'journal.add', text: 'Not done: empty', status: 'rejected', undoable: false, error: 'empty' };
    const kept = checkinReducer(typed, { type: 'answered', questionId: 'open', response: response([rejected]) });
    expect(kept.openText).toBe('A quiet day');
    expect(kept.errors.open).toBe('empty');
  });
});

describe('the sheet and undo', () => {
  it('opens the sheet over the card, and closing it drops what was stepped but not saved', () => {
    let state = checkinReducer(fresh(), { type: 'openSheet' });
    expect(state.sheet).toBe(true);
    state = checkinReducer(state, { type: 'count', questionId: 'habit:water', value: 3 });
    state = checkinReducer(state, { type: 'time', area: 'work', minutes: 30 });
    state = checkinReducer(state, { type: 'closeSheet' });
    expect([state.sheet, state.counts, state.time]).toEqual([false, {}, null]);
  });

  it('keeps the sheet open while answers are changed in it', () => {
    let state = checkinReducer(fresh({ questions: questionsWith(ALL), done: true, answers: answers({ mood: 4 }) }), { type: 'openSheet' });
    state = checkinReducer(state, { type: 'submit', questionId: 'mood' });
    state = checkinReducer(state, {
      type: 'answered',
      questionId: 'mood',
      response: response([line('a9', 'Mood 2', { name: 'mood.set' })], { questions: questionsWith(ALL), answers: answers({ mood: 2 }) }),
    });
    expect(state.sheet).toBe(true);
    expect(state.answers.mood).toBe(2);
  });

  it('undoes a line: pending while sent, then the day re-read', () => {
    let state = fresh({ questions: questionsWith({ mood: true }) });
    state = checkinReducer(state, { type: 'undoStart', actionId: 'a7' });
    expect(state.pending).toBe('undo:a7');
    state = checkinReducer(state, { type: 'undoSettled', actionId: 'a7', error: null, server: server() });
    expect(state.pending).toBeNull();
    expect(shownId(state)).toBe('habit:read');
    expect(state.lineErrors).toEqual({});
  });

  it('a refused undo keeps the server\'s message for its line', () => {
    let state = checkinReducer(fresh(), { type: 'undoStart', actionId: 'a8' });
    const message = 'what this action wrote has been changed since, so it is no longer undone from here';
    state = checkinReducer(state, { type: 'undoSettled', actionId: 'a8', error: message, server: null });
    expect(state.pending).toBeNull();
    expect(state.lineErrors.a8).toBe(message);
  });
});
