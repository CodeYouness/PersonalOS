/**
 * The contexts `npm run measure:context` counts (#204): made-up records in
 * memory, turned into items by the context builder itself and serialised by
 * the context serializer -- the shapes a question really sends, with no store
 * and no data directory. Pure and seeded: the same call builds the same
 * context, so two runs differ only if the model's tokenizer does.
 */

import { buildItems } from '../../lib/ai/context/build.js';
import { financeFigures } from '../../lib/ai/context/figures-finance.js';
import { lifeFigures } from '../../lib/ai/context/figures-life.js';
import { serializeContext } from '../../lib/ai/context/serialize.js';
import { shiftDayKey, weekDayKeys } from '../../lib/domain/dates.js';

/**
 * @typedef {import('../../lib/ai/context/read.js').Archive} Archive
 * @typedef {import('../../lib/ai/context/index.js').QuestionContext} QuestionContext
 * @typedef {import('../../lib/domain/types.js').Transaction} Transaction
 * @typedef {import('../../lib/domain/types.js').JournalEntry} JournalEntry
 * @typedef {import('../../lib/domain/types.js').MemoryEntry} MemoryEntry
 */

/**
 * The parsed data/seed.json, as far as a context reads it.
 *
 * @typedef {Omit<Archive, 'memories' | 'logs'> & {
 *   memory: MemoryEntry[],
 *   dailyLogs: Record<string, import('../../lib/domain/types.js').DailyLog>,
 * }} Seed
 */

/** A day the made-up records count back from: fixed, so runs agree. */
const TODAY = '2026-10-17';
const TIMEZONE = 'Europe/Rome';
const WHEN = { today: TODAY, timezone: TIMEZONE };

/**
 * Descriptions the way the sheet import writes them: the row's note, or its
 * subcategory when the note is empty (scripts/sheet-import/plan.js).
 */
const DESCRIPTIONS = [
  'Supermercato',
  'Spesa Esselunga',
  'Affitto ottobre',
  'Bolletta luce',
  'Abbonamento palestra',
  'Pranzo con colleghi',
  'Farmacia',
  'Treno Milano-Torino',
  'Ristorante',
  'Regalo compleanno Giulia',
  'Benzina',
  'Libri',
];

/**
 * Lines the way a bank statement writes them: upper case, codes, places. No
 * importer writes these yet; measured so a bank import knows where it lands
 * (ADR 0030).
 */
const STATEMENT_LINES = [
  'PAGAMENTO POS ESSELUNGA 4127 MILANO',
  'PAGAMENTO POS CONAD CITY VIA PADOVA',
  'ADDEBITO SDD ENEL ENERGIA SPA FATT. N. 0042',
  'BONIFICO A FAVORE DI ROSSI MARIO AFFITTO',
  'PAGAMENTO CARTA AMAZON EU SARL LUSSEMBURGO',
  'PRELIEVO BANCOMAT INTESA SANPAOLO ATM 0193',
  'PAGAMENTO POS FARMACIA SAN BABILA',
  'ADDEBITO SDD TIM SPA TELEFONIA FISSA',
  'PAGAMENTO CARTA TRENITALIA FRECCIAROSSA',
  'BONIFICO DA NORDIS SRL COMPENSO CONSULENZA',
  'PAGAMENTO POS BAR PASTICCERIA MARCHESI',
  'COMMISSIONI TENUTA CONTO',
];

/** Italian free text: a journal entry, a sentence at a time. */
const SENTENCES = [
  'Giornata lunga in ufficio, ma la riunione con Marta è andata meglio del previsto.',
  'Ho corso cinque chilometri al parco Sempione prima di colazione e mi sentivo leggero.',
  'Domani devo ricordarmi di chiamare il commercialista per la dichiarazione dei redditi.',
  'La proposta per il nuovo cliente ha bisogno di una seconda lettura: il prezzo è ancora troppo basso.',
  'Cena da mia sorella, abbiamo parlato a lungo del viaggio in Sicilia di agosto.',
  'Non ho dormito bene, troppi caffè nel pomeriggio; stasera niente schermi dopo le dieci.',
  'Ho finito il libro di Calvino che avevo iniziato a settembre: il finale mi ha sorpreso.',
  'Il progetto con lo studio di architettura slitta di due settimane, e va bene così.',
];

/**
 * A pseudo-random generator from a seed (mulberry32): the same seed, the
 * same records.
 *
 * @param {number} seed
 * @returns {() => number} in [0, 1)
 */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * An id the way `createId` writes one: the type, then a UUID. A UUID
 * tokenises densely, so a made-up id has to look like a real one.
 *
 * @param {string} type
 * @param {() => number} next
 * @returns {string}
 */
function idOf(type, next) {
  const hex = Array.from({ length: 32 }, () => Math.floor(next() * 16).toString(16)).join('');
  return type + '_' + [hex.slice(0, 8), hex.slice(8, 12), '4' + hex.slice(13, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

/**
 * @template T
 * @param {T[]} list
 * @param {() => number} next
 * @returns {T}
 */
function pick(list, next) {
  return list[Math.floor(next() * list.length)];
}

/**
 * @param {Seed} seed
 * @returns {Archive} the seed as the context reads it
 */
export function archiveOf(seed) {
  const { memory, dailyLogs, ...rest } = seed;
  return { ...rest, memories: memory, logs: Object.values(dailyLogs) };
}

/**
 * The seed's profile and accounts with nothing else, so a made-up record's
 * account and category have names to resolve to.
 *
 * @param {Archive} seed
 * @returns {Archive}
 */
function bare(seed) {
  return {
    profile: seed.profile,
    accounts: seed.accounts,
    tasks: [],
    appointments: [],
    people: [],
    goals: [],
    links: [],
    captures: [],
    memories: [],
    journal: [],
    events: [],
    logs: [],
    observations: [],
    trades: [],
    prices: [],
    transactions: [],
    snapshots: [],
  };
}

/**
 * @param {import('../../lib/ai/context/build.js').ContextItem[]} items
 * @returns {QuestionContext}
 */
function contextOf(items) {
  const week = weekDayKeys(TODAY);
  return {
    today: TODAY,
    week: { from: week[0], to: week[6] },
    timezone: TIMEZONE,
    trackedSince: null,
    summarised: null,
    items,
    tooLarge: false,
  };
}

/**
 * Transactions only, the densest records there are, described by `lines`.
 *
 * @param {string[]} lines
 * @returns {(seed: Archive, count: number) => Archive}
 */
const withTransactions = (lines) => (seed, count) => {
  const next = random(204);
  const categories = seed.profile.financeCategories.map((category) => category.id);
  const accounts = seed.accounts.map((account) => account.id);
  /** @type {Transaction[]} */
  const transactions = Array.from({ length: count }, (_, index) => {
    const date = shiftDayKey(TODAY, -Math.floor(index / 3));
    const amount = -Math.floor(next() * 20_000) - 100;
    return {
      id: idOf('transaction', next),
      date,
      amount: next() < 0.1 ? -amount * 20 : amount,
      currency: 'EUR',
      description: pick(lines, next),
      accountId: pick(accounts, next),
      counterAccountId: null,
      categoryId: next() < 0.15 ? null : pick(categories, next),
      note: '',
      notCounted: false,
      tags: [],
      origin: {
        source: 'sheet',
        externalId: idOf('row', next),
        syncedAt: date + 'T06:00:00.000Z',
        sourceUpdatedAt: null,
      },
      createdAt: date + 'T06:00:00.000Z',
      updatedAt: date + 'T06:00:00.000Z',
      source: 'integration',
    };
  });
  return { ...bare(seed), transactions };
};

/**
 * A free-text mix: Italian journal entries, and memories drawn from them.
 *
 * @param {Archive} seed
 * @param {number} count
 * @returns {Archive}
 */
function withFreeText(seed, count) {
  const next = random(205);
  /** @type {JournalEntry[]} */
  const journal = [];
  /** @type {MemoryEntry[]} */
  const memories = [];
  for (let index = 0; index < count; index += 1) {
    const date = shiftDayKey(TODAY, -index);
    const text = Array.from({ length: 3 + Math.floor(next() * 4) }, () => pick(SENTENCES, next)).join(' ');
    journal.push({
      id: idOf('journal', next),
      date,
      text,
      tags: next() < 0.5 ? ['lavoro'] : [],
      createdAt: date + 'T21:30:00.000Z',
      updatedAt: date + 'T21:30:00.000Z',
      source: 'user',
    });
    memories.push({
      id: idOf('memory', next),
      type: 'fact',
      content: pick(SENTENCES, next),
      confidence: 1,
      tags: ['diario'],
      validFrom: null,
      validUntil: null,
      embedding: null,
      createdAt: date + 'T21:31:00.000Z',
      updatedAt: date + 'T21:31:00.000Z',
      source: 'journal',
    });
  }
  return { ...bare(seed), journal, memories };
}

/**
 * The context the seed's own records make: every item and figure a question
 * on the demo data would send.
 *
 * @param {Archive} seed
 * @returns {QuestionContext}
 */
export function seedContext(seed) {
  return {
    ...contextOf([...buildItems(seed, WHEN), ...financeFigures(seed, WHEN), ...lifeFigures(seed, WHEN)]),
    trackedSince: seed.profile.financeTrackedSince,
  };
}

/** The two made-up mixes, by name. */
export const MIXES = /** @type {const} */ ({
  'transactions only, as the sheet import writes them (worst today)': withTransactions(DESCRIPTIONS),
  'transactions only, as bank statement lines (no importer yet)': withTransactions(STATEMENT_LINES),
  'free text (journal, memories)': withFreeText,
});

/**
 * The largest context of a mix that still fits `maxChars` once serialised:
 * records are added until one more would cross it.
 *
 * @param {(seed: Archive, count: number) => Archive} mix
 * @param {Archive} seed
 * @param {number} maxChars
 * @returns {QuestionContext}
 */
export function fill(mix, seed, maxChars) {
  /** @param {number} count */
  const build = (count) => contextOf(buildItems(mix(seed, count), WHEN));
  // Double until over, then halve the gap: a few dozen builds, not thousands.
  let fits = 0;
  let over = 1;
  while (serializeContext(build(over)).length <= maxChars) {
    fits = over;
    over *= 2;
  }
  while (over - fits > 1) {
    const middle = Math.floor((fits + over) / 2);
    if (serializeContext(build(middle)).length <= maxChars) fits = middle;
    else over = middle;
  }
  return build(fits);
}

/** An empty context: what a question costs before any record. */
export const EMPTY_CONTEXT = contextOf([]);
