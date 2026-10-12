/**
 * Turns the archive into citable items: pure, no store, no clock -- the day
 * and the zone come in, so the same archive always reads the same.
 *
 * An item is one thing a screen shows, written as plain text the model can
 * quote and cite by `id`. What it leaves out is as deliberate as what it
 * holds:
 *
 * - links are not items; they become words on the two records they join
 *   ("involves: Marta Oliveira (person_seed_1)");
 * - a capture that filed a record is not an item; its sentence rides on the
 *   record ("said as: ..."). One that filed nothing is its own item, so the
 *   sentence is still there to cite;
 * - a memory that only repeats the sentence it was drawn from is left out --
 *   the capture carries that sentence already;
 * - sync states, the daily values of habits and deleted records are not here
 *   at all (the store hard-deletes, so a deleted record is simply never read).
 */

import { isOverdue } from '../../domain/derive/tasks.js';
import { slippedPeriod } from '../../domain/derive/goals.js';
import { accountValueOn } from '../../domain/derive/finance.js';
import { limits } from '../../../personalos.config.js';
import {
  crmAddress,
  financesAddress,
  goalsAddress,
  journalAddress,
  nutritionAddress,
} from '../../domain/addresses.js';
import { formatTimeInZone, monthOf, shiftDayKey, toDayKey } from '../../domain/dates.js';
import { refType } from '../../domain/refs.js';
import { formatMoney, formatUnits, humanDay, joinLines, orUnknown, shortLabel } from './render.js';

/**
 * @typedef {'done' | 'overdue' | 'archived' | 'expired' | 'unconfirmed'} ItemLabel
 *   how a record stands, in words the model is told to read literally.
 *   `overdue` is derived (lib/domain/derive/tasks.js `isOverdue`), never stored
 *   (#174).
 */

/**
 * @typedef {object} ContextItem
 * @property {string} id the record's own reference; the profile's is `profile`,
 *   a computed figure's is `figure:<what>:<period>[:<detail>]` (figures-*.js)
 * @property {string} type the entity type word, `profile`, or `figure`
 * @property {string} label short and human: what the panel shows after the badge
 * @property {string} content every field a person could ask about, as text
 * @property {ItemLabel[]} labels
 * @property {string | null} opens where the record opens on its own screen, a
 *   site-relative address; null when it has none and so expands in place. Set
 *   here, from the record, and never sent to the model: where a citation goes
 *   is not for the model to say (#173).
 */

/** The order labels are written in, so two builds of one archive agree. */
const LABEL_ORDER = /** @type {const} */ (['done', 'overdue', 'archived', 'expired', 'unconfirmed']);

/**
 * An item before the links are written into it.
 *
 * @typedef {object} Draft
 * @property {string} id
 * @property {string} type
 * @property {string} label
 * @property {Set<ItemLabel>} flags
 * @property {(string | null | false)[]} lines
 * @property {string | null} opens
 */

/**
 * @param {string} id
 * @param {string} type
 * @param {string} label
 * @param {(string | null | false)[]} lines
 * @param {ItemLabel[]} [flags]
 * @param {string | null} [opens] where it opens; null expands in place
 * @returns {Draft}
 */
function draft(id, type, label, lines, flags = [], opens = null) {
  return { id, type, label, lines, flags: new Set(flags), opens };
}

/**
 * @param {import('./read.js').Archive} archive
 * @param {{ today: string, timezone: string }} when
 * @returns {ContextItem[]}
 */
export function buildItems(archive, { today, timezone }) {
  /** @param {string} instant */
  const dayOf = (instant) => toDayKey(new Date(instant), timezone);
  /** @param {string} instant */
  const timeOf = (instant) => formatTimeInZone(new Date(instant), timezone);

  const accountName = new Map(archive.accounts.map((account) => [account.id, account.name]));
  /** @param {string} accountId */
  const accountLine = (accountId) =>
    'account: ' + (accountName.get(accountId) ?? 'unknown account') + ' (' + accountId + ')';
  const categoryName = categoryNames(archive.profile.financeCategories);

  // What the account table is computed from, so the same account is worth the
  // same here (rule 6: one implementation of a computed number).
  const financeInputs = {
    accounts: archive.accounts,
    observations: archive.observations,
    trades: archive.trades,
    prices: archive.prices,
    transactions: archive.transactions,
  };

  // Where a memory opens is the journal day it was drawn from. A memory from
  // a capture, or made by hand, has no screen to go to. (A journal entry's
  // deletion takes its memories with it, ADR 0027, so none points at nothing.)
  const journalDayById = new Map(archive.journal.map((entry) => [entry.id, entry.date]));
  /** @type {Map<string, string>} memory id -> day key */
  const memoryDay = new Map();
  for (const link of archive.links) {
    const day = link.rel === 'derived_from' ? journalDayById.get(link.to) : undefined;
    if (day !== undefined && refType(link.from) === 'memory') memoryDay.set(link.from, day);
  }

  // The Nutrition screen reads today and the `healthWindowDays` before it, and
  // can show no other day: a meal outside is cited in place, not linked to a
  // screen that would not show it.
  const windowFrom = shiftDayKey(today, -limits.healthWindowDays);
  /** @param {string} day */
  const mealOpens = (day) => (day >= windowFrom && day <= today ? nutritionAddress(day) : null);

  const capturesById = new Map(archive.captures.map((capture) => [capture.id, capture]));
  const leftOut = new Set(
    archive.memories.filter((memory) => repeatsItsCapture(memory, archive.links, capturesById)).map((memory) => memory.id)
  );

  /** @type {Draft[]} */
  const drafts = [
    profileDraft(archive.profile, accountName),

    ...archive.tasks.map((task) => {
      const done = task.completedAt !== null;
      return draft(
        task.id,
        'task',
        shortLabel(task.title),
        [
          'task: ' + task.title,
          done ? 'status: done on ' + dayOf(/** @type {string} */ (task.completedAt)) : 'status: open',
          !done && 'band: ' + task.band + ' (chosen on ' + task.bandSetOn + ')',
          isOverdue(task, today) && 'overdue: yes, it was chosen for a day that has passed',
          'temperature: ' + task.temperature,
          task.note !== '' && 'note: ' + task.note,
          task.tags.length > 0 && 'tags: ' + task.tags.join(', '),
          'added: ' + dayOf(task.createdAt),
        ],
        // Done and overdue never both: the derivation says a done task is not late.
        done ? ['done'] : isOverdue(task, today) ? ['overdue'] : [],
        crmAddress('board', task.id)
      );
    }),

    ...archive.appointments.map((appointment) =>
      draft(appointment.id, 'appointment', shortLabel(appointment.title), [
        'appointment: ' + appointment.title,
        'date: ' + appointment.date,
        'time: ' + appointment.startTime + (appointment.endTime === null ? '' : ' to ' + appointment.endTime),
        'calendar: ' + appointment.calendarLabel,
        appointment.note !== '' && 'note: ' + appointment.note,
        !appointment.confirmed && 'no longer seen in the calendar it was synced from (kept for its note)',
        appointment.origin !== null && 'synced from: ' + appointment.origin.source,
      ])
    ),

    ...archive.people.map((person) =>
      draft(person.id, 'person', shortLabel(person.name), [
        'person: ' + person.name,
        person.organization !== '' && 'organization: ' + person.organization,
        person.kind !== '' && 'kind: ' + person.kind,
        person.note !== '' && 'note: ' + person.note,
      ])
    ),

    ...archive.goals.map((goal) => {
      const slipped = slippedPeriod(goal, today);
      return draft(
        goal.id,
        'goal',
        shortLabel(goal.name),
        [
          'goal: ' + goal.name,
          'kind: ' + goal.kind,
          goal.done ? 'status: done' : 'status: open',
          'horizon: ' + goal.horizon + ' (chosen on ' + goal.horizonSetOn + ')',
          !goal.done && slipped !== null && 'slipped: yes, it is in period ' + slipped + ' since its horizon was chosen',
          goal.progress !== null && 'progress: ' + goal.progress.current + ' of ' + goal.progress.target,
          goal.targetDate !== null && 'target date: ' + goal.targetDate,
        ],
        goal.done ? ['done'] : [],
        goalsAddress(goal.id)
      );
    }),

    ...archive.profile.habits.map((habit) => {
      const archived = !habit.periods.some((period) => period.to === null);
      return draft(
        habit.id,
        'habit',
        shortLabel(habit.label),
        [
          'habit: ' + habit.label,
          habit.type === 'counter' ? 'type: counter, daily target ' + orUnknown(habit.target) : 'type: check (done or not)',
          archived ? 'status: archived (no open period)' : 'status: active',
          'active over: ' +
            habit.periods.map((period) => period.from + ' to ' + (period.to ?? 'now')).join('; '),
        ],
        archived ? ['archived'] : []
      );
    }),

    ...archive.memories
      .filter((memory) => !leftOut.has(memory.id))
      .map((memory) => {
        const expired = memory.validUntil !== null && memory.validUntil < today;
        const journalDay = memoryDay.get(memory.id);
        /** @type {ItemLabel[]} */
        const flags = [];
        if (expired) flags.push('expired');
        if (memory.confidence < 1) flags.push('unconfirmed');
        return draft(
          memory.id,
          'memory',
          shortLabel(memory.content),
          [
            'memory (' + memory.type + '): ' + memory.content,
            'confidence: ' + memory.confidence,
            memory.validFrom !== null && 'valid from: ' + memory.validFrom,
            memory.validUntil !== null && 'valid until: ' + memory.validUntil,
            memory.tags.length > 0 && 'tags: ' + memory.tags.join(', '),
            'saved: ' + dayOf(memory.createdAt) + ' (' + memory.source + ')',
          ],
          flags,
          journalDay === undefined ? null : journalAddress(journalDay)
        );
      }),

    ...archive.journal.map((entry) =>
      draft(
        entry.id,
        'journal',
        humanDay(entry.date),
        [
          'journal entry for: ' + entry.date,
          entry.tags.length > 0 && 'tags: ' + entry.tags.join(', '),
          'text: ' + entry.text,
          'written: ' + dayOf(entry.createdAt),
        ],
        [],
        journalAddress(entry.date)
      )
    ),

    ...archive.logs.flatMap((log) => [
      ...log.meals.map((meal) =>
        draft(
          meal.id,
          'meal',
          shortLabel(meal.name),
          [
            'meal: ' + meal.name,
            'date: ' + log.date,
            'time: ' + orUnknown(meal.time),
            'calories: ' + orUnknown(meal.calories),
            'protein: ' + orUnknown(meal.protein, ' g'),
            'carbs: ' + orUnknown(meal.carbs, ' g'),
            'fat: ' + orUnknown(meal.fat, ' g'),
            meal.estimated ? 'the numbers are an estimate' : 'the numbers were set by hand',
          ],
          [],
          mealOpens(log.date)
        )
      ),
      ...log.measurements.map((measurement) =>
        draft(
          measurement.id,
          'measurement',
          capitalise(measurement.metric) + ' ' + measurement.value + ' ' + measurement.unit + ', ' + humanDay(log.date),
          [
            'measurement: ' + measurement.metric,
            'value: ' + measurement.value + ' ' + measurement.unit,
            'date: ' + log.date,
            measurement.recordedAt !== null &&
              dayOf(measurement.recordedAt) === log.date &&
              'time: ' + timeOf(measurement.recordedAt),
          ]
        )
      ),
    ]),

    ...archive.accounts.map((account) => {
      const archived = account.archivedOn !== null;
      return draft(
        account.id,
        'account',
        shortLabel(account.name),
        [
          'account: ' + account.name,
          'kind: ' + account.kind + ', currency ' + account.currency,
          archived ? 'status: archived on ' + account.archivedOn : 'status: open',
          accountValueLine(account, financeInputs, today),
          account.origin !== null && 'imported from: ' + account.origin.source,
        ],
        archived ? ['archived'] : [],
        financesAddress({ account: account.id })
      );
    }),

    ...archive.observations.map((observation) =>
      draft(
        observation.id,
        'observation',
        shortLabel((accountName.get(observation.accountId) ?? 'Account') + ' ' + observation.kind + ', ' + humanDay(observation.date)),
        [
          'observation: ' + observation.kind,
          accountLine(observation.accountId),
          'amount: ' + formatMoney(observation.amount, observation.currency),
          'date: ' + observation.date,
          observation.origin !== null && 'imported from: ' + observation.origin.source,
        ]
      )
    ),

    ...archive.trades.map((trade) =>
      draft(
        trade.id,
        'trade',
        shortLabel(capitalise(trade.direction) + ' ' + (accountName.get(trade.accountId) ?? 'holding') + ', ' + humanDay(trade.date)),
        [
          'trade: ' + trade.direction,
          accountLine(trade.accountId),
          'date: ' + trade.date,
          'amount traded: ' + formatUnits(trade.units) + ' units',
          'price per unit: ' + formatMoney(trade.price, trade.currency),
          'fee: ' + formatMoney(trade.fee, trade.currency),
        ]
      )
    ),

    ...archive.prices.map((price) =>
      draft(
        price.id,
        'price',
        shortLabel((accountName.get(price.accountId) ?? 'Holding') + ' price, ' + humanDay(price.date)),
        [
          'price of one unit: ' + formatMoney(price.price, price.currency),
          accountLine(price.accountId),
          'date: ' + price.date,
        ]
      )
    ),

    ...archive.transactions.map((transaction) => {
      const category = transaction.categoryId === null ? undefined : categoryName.get(transaction.categoryId);
      const counter =
        transaction.counterAccountId === null
          ? null
          : (accountName.get(transaction.counterAccountId) ?? 'unknown account') + ' (' + transaction.counterAccountId + ')';
      return draft(
        transaction.id,
        'transaction',
        shortLabel((transaction.description === '' ? 'Transaction' : transaction.description) + ', ' + humanDay(transaction.date)),
        [
          'transaction: ' + transaction.description,
          'date: ' + transaction.date,
          'amount: ' + formatMoney(transaction.amount, transaction.currency) +
            (transaction.amount < 0 ? ' (money out)' : ' (money in)'),
          accountLine(transaction.accountId),
          counter !== null && 'transfer to: ' + counter + ' -- money between your own accounts, neither spending nor income',
          counter === null && 'category: ' + (category ?? 'uncategorised'),
          transaction.notCounted && 'not counted: it moves a balance but is neither income nor spending',
          transaction.tags.length > 0 && 'tags: ' + transaction.tags.join(', '),
          transaction.note !== '' && 'note: ' + transaction.note,
          transaction.origin !== null && 'imported from: ' + transaction.origin.source,
        ],
        [],
        financesAddress({ month: monthOf(transaction.date), transaction: transaction.id })
      );
    }),

    ...archive.snapshots.map((snapshot) =>
      draft(snapshot.id, 'snapshot', 'Net worth on ' + humanDay(snapshot.date), [
        'net worth snapshot for: ' + snapshot.date,
        'net worth: ' + formatMoney(snapshot.netWorth, snapshot.currency),
        'cash: ' + formatMoney(snapshot.cash, snapshot.currency),
        'invested: ' + formatMoney(snapshot.invested, snapshot.currency),
        'other assets: ' + formatMoney(snapshot.otherAssets, snapshot.currency),
        'liabilities: ' + formatMoney(snapshot.liabilities, snapshot.currency),
        snapshot.notes !== '' && 'notes: ' + snapshot.notes,
      ])
    ),
  ];

  // What names a record when a link or an event points at it. Habits are in
  // here because a link can join one to a goal.
  const drafted = new Map(drafts.map((entry) => [entry.id, entry]));

  // A capture that filed a record rides on that record; one that filed
  // nothing becomes an item of its own, after the records and before the
  // events (the order the screens would list them).
  /** @type {Map<string, string[]>} */
  const saidAs = new Map();
  const filed = new Set();
  for (const link of archive.links) {
    if (link.rel !== 'about' || refType(link.from) !== 'capture') continue;
    const capture = capturesById.get(link.from);
    if (capture === undefined || !drafted.has(link.to)) continue;
    filed.add(capture.id);
    saidAs.set(link.to, [...(saidAs.get(link.to) ?? []), capture.text]);
  }
  const captureDrafts = archive.captures
    .filter((capture) => !filed.has(capture.id))
    .map((capture) =>
      draft(capture.id, 'capture', shortLabel(capture.text), [
        'capture: ' + capture.text,
        'said on: ' + dayOf(capture.createdAt),
        // No claim about what it produced: the record may have been deleted
        // since, or be a note on a day, and "none was made" would be false.
        'filed as: ' + capture.destination + ' (decided by ' + capture.route + ')',
      ])
    );
  for (const entry of captureDrafts) drafted.set(entry.id, entry);

  const captureTexts = new Map(archive.captures.map((capture) => [capture.id, capture.text]));
  const eventDrafts = archive.events.map((event) =>
    draft(event.id, 'event', event.type + ', ' + humanDay(event.date), [
      'event: ' + event.type,
      'date: ' + event.date,
      'time: ' + timeOf(event.at),
      event.subject !== null && subjectLine(event.subject, drafted, captureTexts),
      detailsLine(event.payload),
    ])
  );
  for (const entry of eventDrafts) drafted.set(entry.id, entry);

  // Links, in words, on both ends. A link whose other end is not an item
  // (a memory left out, a capture that rides on a record) says nothing.
  /** @type {Map<string, string[]>} */
  const related = new Map();
  /**
   * @param {string} id
   * @param {string} line
   */
  const relate = (id, line) => related.set(id, [...(related.get(id) ?? []), line]);
  for (const link of archive.links) {
    if (link.rel === 'about' && refType(link.from) === 'capture') continue;
    const from = drafted.get(link.from);
    const to = drafted.get(link.to);
    if (from === undefined || to === undefined) continue;
    relate(from.id, outgoing(link.rel, to));
    relate(to.id, incoming(link.rel, from));
  }

  return [...drafts, ...captureDrafts, ...eventDrafts].map((entry) => ({
    id: entry.id,
    type: entry.type,
    label: entry.label,
    content: joinLines([
      ...entry.lines,
      ...(related.get(entry.id) ?? []),
      ...(saidAs.get(entry.id) ?? []).map((text) => 'said as: ' + text),
    ]),
    labels: LABEL_ORDER.filter((label) => entry.flags.has(label)),
    opens: entry.opens,
  }));
}

/**
 * A memory that was drawn from a capture, saved from it, and says what it
 * said -- trimmed and case-folded -- only repeats the sentence. Only while
 * it holds nothing the capture lacks: once it has an expiry, a doubt, a tag
 * or another type it is a statement about the sentence, and it stays so its
 * labels reach the model.
 *
 * @param {import('../../domain/types.js').MemoryEntry} memory
 * @param {import('../../domain/types.js').Link[]} links
 * @param {Map<string, import('../../domain/types.js').Capture>} captures
 * @returns {boolean}
 */
function repeatsItsCapture(memory, links, captures) {
  if (memory.source !== 'capture') return false;
  const bare =
    memory.type === 'fact' &&
    memory.confidence === 1 &&
    memory.validFrom === null &&
    memory.validUntil === null &&
    memory.tags.length === 0;
  if (!bare) return false;
  return links.some((link) => {
    if (link.rel !== 'derived_from' || link.from !== memory.id) return false;
    const capture = captures.get(link.to);
    return capture !== undefined && same(capture.text, memory.content);
  });
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {boolean}
 */
function same(left, right) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * @param {string} text
 * @returns {string}
 */
function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * What an account is worth today, by the one derivation the account table
 * uses (ADR 0024): its latest observation plus the movements recorded after
 * it, or a holding's units times its latest price. An account nothing values
 * is unknown, never zero.
 *
 * @param {import('../../domain/types.js').FinanceAccount} account
 * @param {import('../../domain/derive/finance.js').FinanceInputs} inputs
 * @param {string} today day key
 * @returns {string}
 */
function accountValueLine(account, inputs, today) {
  const value = accountValueOn(account, inputs, today);
  if (account.valuation === 'units') {
    return value === null
      ? 'value: unknown (no trades recorded)'
      : 'value: ' + formatMoney(value.amount, account.currency) + ' (as of ' + value.date + ', its units times the latest price)';
  }
  if (value === null) return 'balance: unknown (none recorded)';
  const word = account.kind === 'liability' ? 'owed' : account.kind === 'cash' ? 'balance' : 'value';
  return (
    word + ': ' + formatMoney(value.amount, account.currency) +
    ' (as of ' + value.date + ', the latest observation plus the movements after it)'
  );
}

/**
 * @param {import('../../domain/types.js').FinanceCategory[]} categories
 * @returns {Map<string, string>} id -> "Rent (under Home)"
 */
function categoryNames(categories) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  return new Map(
    categories.map((category) => {
      const parent = category.parentId === null ? undefined : byId.get(category.parentId);
      return [category.id, parent === undefined ? category.name : category.name + ' (under ' + parent.name + ')'];
    })
  );
}

/**
 * The profile: who you are, what today is about, and the lists your screens
 * are configured with. Habits and accounts are items of their own.
 *
 * @param {import('../../domain/types.js').Profile} profile
 * @param {Map<string, string>} accountName
 * @returns {Draft}
 */
function profileDraft(profile, accountName) {
  const top = profile.financeCategories.filter((category) => category.parentId === null);
  const categories = top.map((category) => {
    const children = profile.financeCategories.filter((child) => child.parentId === category.id);
    return (
      category.name +
      ' (' + category.kind + (category.fixedCost ? ', fixed cost' : '') + (category.archived ? ', archived' : '') + ')' +
      (children.length === 0
        ? ''
        : ' with ' +
          children
            .map((child) => child.name + (child.fixedCost ? ' (fixed cost)' : '') + (child.archived ? ' (archived)' : ''))
            .join(', '))
    );
  });
  return draft('profile', 'profile', shortLabel(profile.name), [
    'profile: ' + profile.name,
    profile.role !== '' && 'role: ' + profile.role,
    profile.city !== '' && 'city: ' + profile.city,
    profile.focus !== '' && 'what today is about: ' + profile.focus,
    'daily calorie target: ' + profile.calorieTarget,
    'base currency: ' + profile.baseCurrency,
    'finance tracked since: ' + (profile.financeTrackedSince ?? 'not set'),
    profile.defaultAccountId !== null &&
      'default account: ' + (accountName.get(profile.defaultAccountId) ?? 'unknown') + ' (' + profile.defaultAccountId + ')',
    categories.length > 0 && 'finance categories: ' + categories.join('; '),
    'habits: ' + (profile.habits.map((habit) => habit.label).join(', ') || 'none'),
  ]);
}

/**
 * The only payload keys a model may read. A payload holds "what no entity
 * holds", and one of them is the sentence of a capture that was deleted
 * (`capture.deleted`): the correction with no way back (ADR 0013), which no
 * screen shows. What is left is vocabulary and counts.
 */
const SAFE_PAYLOAD_KEYS = ['destination', 'from', 'to', 'integration', 'written'];

/**
 * @param {Record<string, unknown>} payload
 * @returns {string | false}
 */
function detailsLine(payload) {
  const shown = SAFE_PAYLOAD_KEYS.flatMap((key) => {
    const value = payload[key];
    return typeof value === 'string' || typeof value === 'number' ? [key + ' ' + value] : [];
  });
  return shown.length > 0 && 'details: ' + shown.join(', ');
}

/**
 * @param {string} subject the event's subject reference
 * @param {Map<string, Draft>} drafted
 * @param {Map<string, string>} captureTexts
 * @returns {string}
 */
function subjectLine(subject, drafted, captureTexts) {
  const record = drafted.get(subject);
  if (record !== undefined) return 'about: ' + record.label + ' (' + subject + ')';
  const said = captureTexts.get(subject);
  if (said !== undefined) return 'about: a capture, said as: ' + said;
  return 'about: a record that no longer exists';
}

/**
 * How one end of a link reads the other.
 *
 * @param {string} rel one of LINK_RELS
 * @param {Draft} other the record at the far end
 * @returns {string}
 */
function outgoing(rel, other) {
  const named = other.label + ' (' + other.id + ')';
  switch (rel) {
    case 'belongs_to':
      return 'belongs to ' + other.type + ': ' + named;
    case 'involves':
      return 'involves: ' + named;
    case 'derived_from':
      return 'drawn from ' + other.type + ': ' + named;
    case 'funds':
      return 'funds ' + other.type + ': ' + named;
    default:
      return 'about: ' + named;
  }
}

/**
 * The same link, read from the record it points at.
 *
 * @param {string} rel one of LINK_RELS
 * @param {Draft} other the record at the near end
 * @returns {string}
 */
function incoming(rel, other) {
  const named = other.label + ' (' + other.id + ')';
  switch (rel) {
    case 'belongs_to':
      return 'has ' + other.type + ': ' + named;
    case 'involves':
      return 'involved in ' + other.type + ': ' + named;
    case 'derived_from':
      return 'source of ' + other.type + ': ' + named;
    case 'funds':
      return 'funded by ' + other.type + ': ' + named;
    default:
      return 'mentioned by ' + other.type + ': ' + named;
  }
}
