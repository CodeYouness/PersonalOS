/**
 * The check-in panel's state transitions (ADR 0037), without a DOM. The panel
 * shows the server's state -- what GET or POST /api/checkin answered, or what
 * the page was rendered with -- never its own memory of what it sent; what it
 * keeps itself is only what has not been sent yet: a counter's count, the
 * time being declared, the open answer being typed, which skip list is open,
 * and why a request failed.
 */

import { describe, expect, it } from 'vitest';

import {
  checkinReducer,
  counterValue,
  initialCheckinState,
  progress,
  receiptLines,
  rowsToAsk,
} from '@/components/checkinReducer.js';

/** @param {string} id @param {boolean} answered @param {object} [over] */
function habit(id, answered, over = {}) {
  return { id: 'habit:' + id, kind: 'habit', subjectId: id, label: id, answered, habitType: 'check', target: null, ...over };
}

/**
 * @param {object} [answered] which fixed questions are answered
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

/** @param {string} id @param {string} text @param {object} [over] */
function line(id, text, over = {}) {
  return { actionId: id, name: 'habit.set', text, status: 'done', undoable: true, error: null, ...over };
}

function fresh(over = {}) {
  return initialCheckinState({ questions: questionsWith(), done: false, lines: [], values: {}, ...over });
}

/**
 * What POST /api/checkin answers.
 *
 * @param {any[]} questions
 * @param {any[]} receipt this request's lines
 * @param {any[]} dayReceipt the day's kept lines
 */
function response(questions, receipt, dayReceipt) {
  const done = questions.every((question) => question.answered || question.kind === 'open');
  return { questions, done, receipt: { lines: receipt }, dayReceipt: { lines: dayReceipt } };
}

describe('the check-in panel state', () => {
  it('starts from what the server rendered, with nothing pending and nothing typed', () => {
    const state = fresh();
    expect(state.pending).toBeNull();
    expect(state.errors).toEqual({});
    expect(state.openText).toBeNull();
    expect(rowsToAsk(state).map((question) => question.id)).toEqual(['habit:read', 'habit:water', 'mood', 'energy', 'time']);
  });

  it('counts progress over every question but the open one', () => {
    expect(progress(fresh())).toEqual({ answered: 0, total: 5, done: false });
    const partly = fresh({ questions: questionsWith({ read: true, mood: true, energy: true }) });
    expect(progress(partly)).toEqual({ answered: 3, total: 5, done: false });
    expect(rowsToAsk(partly).map((question) => question.id)).toEqual(['habit:water', 'time']);
  });

  it('asks nothing but the open question once the check-in is done', () => {
    const all = { read: true, water: true, mood: true, energy: true, time: true };
    const state = fresh({ questions: questionsWith(all), done: true });
    expect(rowsToAsk(state)).toEqual([]);
    expect(progress(state)).toEqual({ answered: 5, total: 5, done: true });
  });

  it('marks one row pending while its answer is sent, and clears that row\'s old error', () => {
    let state = checkinReducer(fresh(), { type: 'failed', questionId: 'mood', error: 'Could not reach the server' });
    state = checkinReducer(state, { type: 'submit', questionId: 'mood' });
    expect(state.pending).toBe('mood');
    expect(state.errors.mood).toBeUndefined();
  });

  it('re-renders from what the server answered: the question leaves, the receipt is the day\'s', () => {
    const kept = [line('a1', 'Mood 4', { name: 'mood.set' })];
    let state = checkinReducer(fresh(), { type: 'submit', questionId: 'mood' });
    state = checkinReducer(state, {
      type: 'answered',
      questionId: 'mood',
      response: response(questionsWith({ mood: true }), kept, kept),
    });
    expect(state.pending).toBeNull();
    expect(rowsToAsk(state).map((question) => question.id)).not.toContain('mood');
    expect(receiptLines(state)).toEqual(kept);
    expect(state.errors).toEqual({});
  });

  it('a failed request says so in its row and changes nothing else', () => {
    const before = checkinReducer(fresh(), { type: 'type', text: 'A quiet day' });
    let state = checkinReducer(before, { type: 'submit', questionId: 'open' });
    state = checkinReducer(state, { type: 'failed', questionId: 'open', error: 'Could not reach the server' });
    expect(state.pending).toBeNull();
    expect(state.errors.open).toBe('Could not reach the server');
    expect(state.openText).toBe('A quiet day');
    expect(state.questions).toBe(before.questions);
    expect(state.lines).toBe(before.lines);
  });

  it('shows a rejected line in its row and on the receipt, though the day keeps no record of it', () => {
    const rejected = { actionId: null, name: '', text: 'Not done: mood: out of range', status: 'rejected', undoable: false, error: 'mood: out of range' };
    let state = checkinReducer(fresh(), { type: 'submit', questionId: 'mood' });
    state = checkinReducer(state, { type: 'answered', questionId: 'mood', response: response(questionsWith(), [rejected], []) });
    expect(state.errors.mood).toBe('mood: out of range');
    expect(receiptLines(state)).toEqual([rejected]);
    // The next answer starts a new request: the old rejection is not carried on.
    state = checkinReducer(state, { type: 'submit', questionId: 'energy' });
    expect(receiptLines(state)).toEqual([]);
  });

  it('a failed action is kept by the day: its row says so, and the receipt shows it once', () => {
    const failed = line('a2', 'Read ticked', { status: 'failed', undoable: false, error: 'no habit read' });
    let state = checkinReducer(fresh(), { type: 'submit', questionId: 'habit:read' });
    state = checkinReducer(state, { type: 'answered', questionId: 'habit:read', response: response(questionsWith(), [failed], [failed]) });
    expect(state.errors['habit:read']).toBe('no habit read');
    expect(receiptLines(state)).toEqual([failed]);
  });

  it('clears the open answer once it is saved, and keeps it when the save is rejected', () => {
    const typed = checkinReducer(fresh(), { type: 'type', text: 'A quiet day' });
    const saved = checkinReducer(typed, {
      type: 'answered',
      questionId: 'open',
      response: response(questionsWith(), [line('a3', 'Journal entry added', { name: 'journal.add' })], []),
    });
    expect(saved.openText).toBe('');

    const rejected = { actionId: null, name: 'journal.add', text: 'Not done: empty', status: 'rejected', undoable: false, error: 'empty' };
    const kept = checkinReducer(typed, { type: 'answered', questionId: 'open', response: response(questionsWith(), [rejected], []) });
    expect(kept.openText).toBe('A quiet day');
    expect(kept.errors.open).toBe('empty');
  });

  it('opens one skip list at a time, and closes it when its answer is filed', () => {
    let state = checkinReducer(fresh(), { type: 'toggleSkip', questionId: 'habit:read' });
    expect(state.skipping).toBe('habit:read');
    state = checkinReducer(state, { type: 'toggleSkip', questionId: 'habit:water' });
    expect(state.skipping).toBe('habit:water');
    state = checkinReducer(state, { type: 'toggleSkip', questionId: 'habit:water' });
    expect(state.skipping).toBeNull();
    state = checkinReducer(state, { type: 'toggleSkip', questionId: 'habit:read' });
    state = checkinReducer(state, {
      type: 'answered',
      questionId: 'habit:read',
      response: response(questionsWith({ read: true }), [line('a4', 'Read: Forgotten', { name: 'habit.skip' })], []),
    });
    expect(state.skipping).toBeNull();
  });

  it('steps a counter from its saved count, between nothing and its target', () => {
    const question = questionsWith()[1];
    let state = fresh({ values: { water: 3 } });
    expect(counterValue(state, question)).toBe(3);
    state = checkinReducer(state, { type: 'count', questionId: 'habit:water', value: 4 });
    expect(counterValue(state, question)).toBe(4);
    state = checkinReducer(state, { type: 'count', questionId: 'habit:water', value: 9 });
    expect(counterValue(state, question)).toBe(8);
    state = checkinReducer(state, { type: 'count', questionId: 'habit:water', value: -1 });
    expect(counterValue(state, question)).toBe(0);
    expect(counterValue(fresh(), question)).toBe(0);
  });

  it('keeps a sent count until the page is re-read with it saved', () => {
    const question = questionsWith()[1];
    let state = checkinReducer(fresh({ values: { water: 3 } }), { type: 'count', questionId: 'habit:water', value: 5 });
    state = checkinReducer(state, {
      type: 'answered',
      questionId: 'habit:water',
      response: response(questionsWith(), [line('a5', 'Water 5 of 8')], []),
    });
    expect(counterValue(state, question)).toBe(5);
    state = checkinReducer(state, { type: 'loaded', questions: questionsWith(), done: false, lines: [], values: { water: 5 } });
    expect(state.counts).toEqual({});
    expect(counterValue(state, question)).toBe(5);
  });

  it('declares time per area as a draft, sent once, dropping an area brought back to nothing', () => {
    let state = checkinReducer(fresh(), { type: 'time', area: 'work', minutes: 60 });
    state = checkinReducer(state, { type: 'time', area: 'study', minutes: 30 });
    state = checkinReducer(state, { type: 'time', area: 'study', minutes: 0 });
    expect(state.time).toEqual({ work: 60 });
    state = checkinReducer(state, {
      type: 'answered',
      questionId: 'time',
      response: response(questionsWith({ time: true }), [line('a6', 'Work 1h', { name: 'time.set' })], []),
    });
    expect(state.time).toEqual({});
  });

  it('follows the page when it is re-read -- a habit ticked on another card leaves the list', () => {
    const typed = checkinReducer(fresh(), { type: 'type', text: 'Half written' });
    const pending = checkinReducer(typed, { type: 'submit', questionId: 'mood' });
    const state = checkinReducer(pending, {
      type: 'loaded',
      questions: questionsWith({ read: true }),
      done: false,
      lines: [],
      values: { read: true },
    });
    expect(rowsToAsk(state).map((question) => question.id)).not.toContain('habit:read');
    expect(state.values).toEqual({ read: true });
    // What is being typed, and the request still running, are the panel's own.
    expect(state.openText).toBe('Half written');
    expect(state.pending).toBe('mood');
  });

  it('a re-read without habit values keeps the ones it had', () => {
    const state = checkinReducer(fresh({ values: { water: 2 } }), { type: 'loaded', questions: questionsWith(), done: false, lines: [] });
    expect(state.values).toEqual({ water: 2 });
  });

  it('undoes a line: pending while sent, then the day re-read', () => {
    const kept = [line('a7', 'Mood 4', { name: 'mood.set' })];
    let state = fresh({ questions: questionsWith({ mood: true }), lines: kept });
    state = checkinReducer(state, { type: 'undoStart', actionId: 'a7' });
    expect(state.pending).toBe('undo:a7');
    const undone = [{ ...kept[0], status: 'undone', undoable: false }];
    state = checkinReducer(state, { type: 'undoSettled', actionId: 'a7', error: null, server: { questions: questionsWith(), done: false, lines: undone } });
    expect(state.pending).toBeNull();
    expect(receiptLines(state)).toEqual(undone);
    expect(rowsToAsk(state).map((question) => question.id)).toContain('mood');
    expect(state.lineErrors).toEqual({});
  });

  it('a refused undo shows the server\'s message on its line', () => {
    const kept = [line('a8', 'Read ticked')];
    let state = checkinReducer(fresh({ lines: kept }), { type: 'undoStart', actionId: 'a8' });
    const message = 'what this action wrote has been changed since, so it is no longer undone from here';
    state = checkinReducer(state, { type: 'undoSettled', actionId: 'a8', error: message, server: null });
    expect(state.pending).toBeNull();
    expect(state.lineErrors.a8).toBe(message);
    expect(state.lines).toBe(kept);
  });
});
