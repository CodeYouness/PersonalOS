/**
 * The open answers `npm run eval:classify -- --suite checkin` reads, each
 * with the actions it should file (ADR 0037). Every one is made up -- the
 * repository is public, and no real sentence, habit, amount or account
 * belongs here; the habits, categories and accounts below are invented
 * fixtures, told to the model as the store would tell it yours.
 *
 * Every answer is given on Tuesday 22 September 2026. A case names, per
 * action, only the params worth scoring: a task's title and an expense's
 * note are free text and never scored, and an expense with no `categoryId`
 * in the case is scored on its amount alone. `optional` lists what a
 * reasonable reading may add or leave out -- matched by name, and by the
 * params it names -- so an ambiguous sentence fails only on what is wrong.
 * An empty `expected` is "nothing to file", a real answer.
 */

/** @typedef {import('./score.js').Case} Case */

export const DAY = '2026-09-22';

/** @type {import('../../lib/checkin/interpret.js').OpenAnswerContext} */
export const CONTEXT = {
  day: DAY,
  habits: [
    { id: 'habit_gym', name: 'Gym', type: 'check', target: null },
    { id: 'habit_read', name: 'Read', type: 'check', target: null },
    { id: 'habit_water', name: 'Glasses of water', type: 'counter', target: 8 },
    { id: 'habit_meditate', name: 'Meditate', type: 'check', target: null },
  ],
  categories: [
    { id: 'cat_groceries', name: 'Groceries' },
    { id: 'cat_restaurants', name: 'Restaurants' },
    { id: 'cat_transport', name: 'Transport' },
    { id: 'cat_books', name: 'Books' },
  ],
  accounts: ['Current account', 'Cash'],
};

const GYM = { action: 'habit.set', params: { habitId: 'habit_gym', value: true } };
const READ = { action: 'habit.set', params: { habitId: 'habit_read', value: true } };
const MEDITATE = { action: 'habit.set', params: { habitId: 'habit_meditate', value: true } };

/** @param {number} amount @param {string} [categoryId] @param {string} [account] */
function spent(amount, categoryId, account) {
  return {
    action: 'expense.record',
    params: { amount, ...(categoryId === undefined ? {} : { categoryId }), ...(account === undefined ? {} : { account }) },
  };
}

/** @param {string} area @param {number} minutes */
function time(area, minutes) {
  return { action: 'time.set', params: { area, minutes } };
}

/** @type {readonly Case[]} */
export const CASES = Object.freeze([
  // A habit and money, the sentence ADR 0037 is written around.
  { text: 'ho fatto palestra e speso 18 euro di pranzo', expected: [GYM, spent(1800, 'cat_restaurants')] },
  { text: 'Went to the gym and spent 18 euros on lunch', expected: [GYM, spent(1800, 'cat_restaurants')] },
  { text: 'Spent about 20 on dinner with friends and meditated for ten minutes', expected: [spent(2000, 'cat_restaurants'), MEDITATE] },
  { text: 'Oggi ho comprato un libro a 9,90 e ne ho letto metà', expected: [spent(990, 'cat_books'), READ] },

  // Comma decimals, two amounts, an account named.
  { text: 'Caffè e cornetto al bar, 3,50', expected: [spent(350, 'cat_restaurants')] },
  { text: 'Spesa al supermercato 42,30', expected: [spent(4230, 'cat_groceries')] },
  { text: 'Pranzo 15 euro, cena 22,40', expected: [spent(1500, 'cat_restaurants'), spent(2240, 'cat_restaurants')] },
  { text: 'Paid 12.50 in cash for the train', expected: [spent(1250, 'cat_transport', 'Cash')] },

  // Time against areas, and a habit with it.
  { text: "Ho letto un'ora e lavorato tre ore", expected: [READ, time('work', 180)] },
  { text: 'Studied for two hours, then 90 minutes on my side project', expected: [time('study', 120), time('projects', 90)] },
  { text: 'Lavorato 7 ore e mezza', expected: [time('work', 450)] },
  { text: 'Ho arbitrato una partita, due ore in tutto', expected: [time('refereeing', 120)] },
  // Mood is given by tap, never read off a sentence: only the time is filed.
  {
    text: 'Mi sentivo stanco, ma ho fatto due ore di allenamento',
    expected: [time('training', 120)],
    optional: [GYM],
  },

  // A counter.
  { text: "Bevuto 6 bicchieri d'acqua", expected: [{ action: 'habit.set', params: { habitId: 'habit_water', value: 6 } }] },

  // A skip, with its reason.
  {
    text: 'Non ho letto, ero troppo stanco',
    expected: [{ action: 'habit.skip', params: { habitId: 'habit_read', reason: 'too-heavy' } }],
  },
  {
    text: 'Skipped meditation on purpose today',
    expected: [{ action: 'habit.skip', params: { habitId: 'habit_meditate', reason: 'on-purpose' } }],
  },

  // A task, alone and with money.
  { text: "Devo chiamare l'idraulico domani", expected: [{ action: 'task.create' }] },
  {
    text: 'Remember to renew the car insurance; groceries came to 25 euros',
    expected: [{ action: 'task.create' }, spent(2500, 'cat_groceries')],
  },

  // Nothing to file.
  { text: 'Giornata tranquilla, niente di speciale', expected: [] },
  { text: 'Felt great today, lots of energy', expected: [] },
  { text: 'Ho speso troppo questo mese', expected: [] },
  { text: 'Oggi giornata di riposo, niente lavoro', expected: [], optional: [{ action: 'time.none' }] },

  // A habit that does not exist is not filed.
  { text: 'Ho fatto yoga stamattina', expected: [], optional: [{ action: 'time.set', params: { area: 'training' } }] },
  { text: 'Went swimming after work', expected: [], optional: [{ action: 'time.set', params: { area: 'training' } }] },

  // Ambiguous: "the usual" is not a habit named.
  { text: 'Fatto il solito, poi pizza con gli amici per 14 euro', expected: [spent(1400, 'cat_restaurants')] },
]);
