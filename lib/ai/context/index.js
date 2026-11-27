/**
 * The AI context layer's first piece (docs/architecture.md): what the model
 * is allowed to know when it answers. Its rule is the layer's rule -- no
 * feature builds its own context. The classifier and the extractor keep the
 * small prompts they own; anything that needs "the user's data" asks here.
 *
 * One intent so far, `question` (#172, ADR 0028): every record a screen
 * shows, as a citable item, then the computed figures the screens show (#174),
 * plus today, the week and the zone to read "yesterday" and "this week"
 * against. Reads only, and only through the
 * store: building a context never writes, and never calls a model or an
 * integration (rule 3).
 *
 * Sized for the model (#175), and kept under Haiku 5.5's 100K-token price
 * step (#204, ADR 0030): over `limits.contextMaxChars`, old transactions
 * give way to their monthly figures, and past that the context says it is
 * too large (budget.js). Nothing else is ever cut.
 *
 * A context may also be built over part of the archive (ADR 0070): the
 * parts and the months in `read`. That is what a question is asked over
 * when the whole does not fit; choosing the parts is the answer module's
 * job (it asks a model), never this layer's.
 */

import { limits } from '../../../personalos.config.js';
import { env } from '../../config/env.js';
import { today, weekDayKeys } from '../../domain/dates.js';
import { monthOf } from '../../domain/dates.js';
import { buildItems } from './build.js';
import { fitToBudget } from './budget.js';
import { financeFigures } from './figures-finance.js';
import { lifeFigures } from './figures-life.js';
import { narrowItems } from './parts.js';
import { readArchive } from './read.js';
import { READ_NOTE } from './serialize.js';

export { serializeContext } from './serialize.js';

/**
 * @typedef {import('./build.js').ContextItem} ContextItem
 */

/**
 * @typedef {object} QuestionContext
 * @property {string} today day key, in the user's timezone (rule 4)
 * @property {{ from: string, to: string }} week the Monday and the Sunday of today's week
 * @property {string} timezone the IANA zone "today" is read in
 * @property {string | null} trackedSince day key finance tracking started on
 * @property {ContextItem[]} items
 * @property {{ since?: string, before: string } | null} summarised set when
 *   transactions were replaced by their monthly figures to fit the budget:
 *   every month before `before` (YYYY-MM, the first month listed in full after
 *   them) is read as monthly totals, its transactions are not among the items
 *   -- or, when `since` is there, only the months from `since` up to `before`:
 *   older ones (before "tracked since") are never summarised and stay whole. Sent
 *   to the model, and shown by the panel. Null when nothing was.
 * @property {import('./parts.js').Read | null} [read] set when the context
 *   holds part of the archive (ADR 0070): the parts, and the months of what
 *   belongs to a month. Sent to the model, and shown with the answer. Null
 *   or absent when it holds the whole.
 * @property {boolean} tooLarge still over the budget with every month that may
 *   be summarised summarised: the question is refused and the model is not
 *   called. Bookkeeping for the answer module; never sent.
 */

/**
 * @param {'question'} intent
 * @param {object} [options]
 * @param {import('./parts.js').Read | null} [options.read] build over these
 *   parts and months only; the whole archive when not given
 * @param {number} [options.maxChars] the budget; `limits.contextMaxChars`
 *   when not given
 * @returns {Promise<QuestionContext>}
 */
export async function buildContext(intent, { read = null, maxChars = limits.contextMaxChars } = {}) {
  if (intent !== 'question') throw new Error('no context is built for ' + JSON.stringify(intent));

  const todayKey = today(env.timezone);
  const week = weekDayKeys(todayKey);
  const archive = await readArchive();
  const when = { today: todayKey, timezone: env.timezone };
  // Records first, figures after: a figure is a number about records and
  // never takes the place of one (docs/domain.md, Computed figure).
  const everything = [...buildItems(archive, when), ...financeFigures(archive, when), ...lifeFigures(archive, when)];
  const monthOfTransaction = new Map(archive.transactions.map((transaction) => [transaction.id, monthOf(transaction.date)]));
  return fitToBudget(
    {
      today: todayKey,
      week: { from: week[0], to: week[6] },
      timezone: env.timezone,
      trackedSince: archive.profile.financeTrackedSince,
      read,
      items: read === null ? everything : narrowItems(everything, read, monthOfTransaction),
    },
    {
      transactions: archive.transactions,
      today: todayKey,
      // What the model is told about a part is sent too, so it is counted.
      maxChars: read === null ? maxChars : maxChars - READ_NOTE.length,
      // The months were chosen for the question: only the newest is owed in
      // full, and the older ones may give way to their monthly figures.
      recentMonths: read === null ? limits.contextRecentMonths : 1,
    }
  );
}
