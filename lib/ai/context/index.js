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
 */

import { limits } from '../../../personalos.config.js';
import { env } from '../../config/env.js';
import { today, weekDayKeys } from '../../domain/dates.js';
import { buildItems } from './build.js';
import { fitToBudget } from './budget.js';
import { financeFigures } from './figures-finance.js';
import { lifeFigures } from './figures-life.js';
import { readArchive } from './read.js';

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
 * @property {boolean} tooLarge still over the budget with every month that may
 *   be summarised summarised: the question is refused and the model is not
 *   called. Bookkeeping for the answer module; never sent.
 */

/**
 * @param {'question'} intent
 * @returns {Promise<QuestionContext>}
 */
export async function buildContext(intent) {
  if (intent !== 'question') throw new Error('no context is built for ' + JSON.stringify(intent));

  const todayKey = today(env.timezone);
  const week = weekDayKeys(todayKey);
  const archive = await readArchive();
  const when = { today: todayKey, timezone: env.timezone };
  return fitToBudget(
    {
      today: todayKey,
      week: { from: week[0], to: week[6] },
      timezone: env.timezone,
      trackedSince: archive.profile.financeTrackedSince,
      // Records first, figures after: a figure is a number about records and
      // never takes the place of one (docs/domain.md, Computed figure).
      items: [...buildItems(archive, when), ...financeFigures(archive, when), ...lifeFigures(archive, when)],
    },
    {
      transactions: archive.transactions,
      today: todayKey,
      maxChars: limits.contextMaxChars,
      recentMonths: limits.contextRecentMonths,
    }
  );
}
