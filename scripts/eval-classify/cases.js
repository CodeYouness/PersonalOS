/**
 * The sentences `npm run eval:classify` files, each with what it should
 * file as (#197). Every one is made up -- the repository is public, and no
 * real capture, meal, amount or account belongs here.
 *
 * Every sentence is said on Tuesday 22 September 2026, so "giovedì" is the
 * 24th, "domani" the 23rd and "ieri" the 21st. A case names only the fields
 * worth scoring: a title is free text and never scored, and a model passes a
 * meal's numbers within 25% of them. A date of null means "on the day it
 * was said", whether the model names that day or no day.
 *
 * A meal's numbers are CREA's (Tabelle di composizione degli alimenti,
 * https://www.alimentinutrizione.it/tabelle-nutrizionali/<code>) where it
 * has the food, else USDA FoodData Central's
 * (https://fdc.nal.usda.gov/food-details/<fdcId>), for the foods the
 * sentence names and nothing it does not -- no dressing, no sugar -- at the
 * source's standard portion unless the sentence says a weight (#203). Each
 * case names its codes and grams.
 *
 * There are no accounts to offer: the classifier is told your categories
 * only, and reads an account as the sentence says it (ADR 0026).
 */

import { TASK_DESTINATIONS } from '../../personalos.config.js';

/** @typedef {import('./score.js').Case} Case */

export const SAID_ON = '2026-09-22';

/** The categories a finance sentence is offered, as the store would offer yours. */
export const CATEGORIES = Object.freeze([
  { id: 'cat_groceries', name: 'Groceries' },
  { id: 'cat_restaurants', name: 'Restaurants' },
  { id: 'cat_transport', name: 'Transport' },
  { id: 'cat_utilities', name: 'Utilities' },
  { id: 'cat_salary', name: 'Salary' },
  { id: 'cat_health', name: 'Health' },
]);

/** Task and people file the same record: a task, linked to whoever it names. */
const TASK = TASK_DESTINATIONS;

/** @type {readonly { text: string, expected: import('./score.js').Expected }[]} */
const SENTENCES = [
  // Something to do.
  { text: 'call the plumber about the kitchen sink', expected: { destination: TASK } },
  { text: 'rinnovare il passaporto', expected: { destination: TASK } },
  { text: 'submit the tax form by Friday', expected: { destination: TASK } },
  // Something owed to a person: still a task.
  { text: 'mandare a Marta il preventivo entro venerdì', expected: { destination: TASK } },
  { text: 'remind Luca to send me the contract', expected: { destination: TASK } },

  // Worth remembering, not worth doing.
  { text: 'Marta preferisce le riunioni la mattina presto', expected: { destination: 'memory' } },
  { text: 'the good bakery on via Roma is closed on Mondays', expected: { destination: 'memory' } },
  { text: "Giulia's daughter is called Sofia", expected: { destination: 'memory' } },

  // A goal.
  { text: 'voglio leggere dodici libri entro fine anno', expected: { destination: 'goals' } },
  { text: 'goal: run a half marathon by March', expected: { destination: 'goals' } },
  { text: 'obiettivo del mese: meditare dieci minuti al giorno', expected: { destination: 'goals' } },

  // An appointment: a day and a time, read from the day it was said.
  { text: 'dentista giovedì alle 15', expected: { destination: 'appointment', date: '2026-09-24', startTime: '15:00' } },
  {
    text: 'domani riunione con il commercialista dalle 10 alle 11:30',
    expected: { destination: 'appointment', date: '2026-09-23', startTime: '10:00', endTime: '11:30' },
  },
  { text: 'haircut on Saturday at 9:30', expected: { destination: 'appointment', date: '2026-09-26', startTime: '09:30' } },
  { text: 'dopodomani alle 18 aperitivo con Paolo', expected: { destination: 'appointment', date: '2026-09-24', startTime: '18:00' } },

  // A meal: an estimate, and the day it was eaten when not today.
  // CREA PC0037 Pasta alla carbonara, 230 g.
  {
    text: 'had a carbonara for lunch',
    expected: { destination: 'nutrition', date: null, calories: 564, protein: 25, carbs: 65, fat: 24 },
  },
  // CREA PC0001 Pizza Napoletana Margherita STG, the whole pizza: 462 g.
  {
    text: 'ieri sera una pizza margherita intera',
    expected: { destination: 'nutrition', date: '2026-09-21', calories: 1086, protein: 49, carbs: 127, fat: 43 },
  },
  // CREA 002500 Cornetti, 50 g, and 135010 whole milk, 125 g; USDA 171891
  // espresso, 30 g.
  { text: 'alle 8 cappuccino e cornetto', expected: { destination: 'nutrition', date: null, time: '08:00', calories: 284 } },
  // USDA 2705968 Chicken breast, grilled without sauce, skin not eaten, 200 g.
  {
    text: '200 g di petto di pollo alla griglia',
    expected: { destination: 'nutrition', date: null, calories: 352, protein: 59, fat: 11 },
  },
  // CREA 181105 Uova di gallina, intero, sodo, 2 x 50 g, and USDA 2707599
  // Bread, white, toasted, a regular slice: 25 g.
  {
    text: 'two boiled eggs and a slice of toast for breakfast',
    expected: { destination: 'nutrition', date: null, calories: 201, protein: 15 },
  },
  // CREA 005410 Lattuga, 80 g, 123610 Tonno sott'olio, sgocciolato, 50 g, and
  // 000070 Mais dolce in scatola, 30 g. Undressed: the sentence names no oil.
  { text: 'ieri a pranzo insalata con tonno e mais', expected: { destination: 'nutrition', date: '2026-09-21', calories: 145 } },

  // A weight: read when said, never estimated.
  { text: 'pesato stamattina, 74,6', expected: { destination: 'health', weight: 74.6, date: null } },
  { text: 'weighed 81.2 kg yesterday', expected: { destination: 'health', weight: 81.2, date: '2026-09-21' } },
  { text: 'mi sono pesato stamattina', expected: { destination: 'health', weight: null } },
  // Kilos that are not a body weight.
  { text: 'benched 100kg today', expected: { destination: ['health', 'memory'], weight: null } },

  // Money: the amount in cents, which way it went, the account as said and one of the categories.
  {
    text: 'spesi 18,40 al supermercato',
    expected: { destination: 'finance', amount: 1840, direction: 'out', categoryId: 'cat_groceries', date: null },
  },
  { text: 'salary came in: €2,450', expected: { destination: 'finance', amount: 245000, direction: 'in', categoryId: 'cat_salary' } },
  { text: 'Amazon mi ha rimborsato 35 euro', expected: { destination: 'finance', amount: 3500, direction: 'in' } },
  {
    text: 'pagato 62 € di bolletta luce con la Revolut',
    expected: { destination: 'finance', amount: 6200, direction: 'out', account: 'Revolut', categoryId: 'cat_utilities' },
  },
  {
    text: 'ieri 12,50 di taxi',
    expected: { destination: 'finance', amount: 1250, direction: 'out', categoryId: 'cat_transport', date: '2026-09-21' },
  },
  { text: 'paid the restaurant bill at Da Mario, 54', expected: { destination: 'finance', amount: 5400, direction: 'out', categoryId: 'cat_restaurants' } },
  // No amount to believe: still finance, with nothing made up.
  { text: 'ho pagato il meccanico', expected: { destination: 'finance', amount: null } },
];

/** @type {readonly Case[]} */
export const CASES = Object.freeze(SENTENCES.map((sentence) => ({ ...sentence, saidOn: SAID_ON })));
