/**
 * Which integrations exist in this deployment.
 *
 * Started empty on purpose: nothing external was wired up until there was a
 * concrete need, because an integration that exists before then is a
 * credential surface with no payoff (ADR 0010). Adding one means: write it
 * under lib/integrations/<name>/, register it here, and flag it in
 * personalos.config.js.
 */

import { features } from '../../personalos.config.js';
import { assertIsIntegration } from './contract.js';
import googleCalendarIntegration from './google-calendar/index.js';

/** @type {import('./contract.js').Integration[]} */
const REGISTERED = [googleCalendarIntegration];

for (const integration of REGISTERED) assertIsIntegration(integration);

/**
 * @returns {import('./contract.js').Integration[]}
 */
export function enabledIntegrations() {
  if (!features.integrations) return [];
  return REGISTERED.filter((integration) => integration.isConfigured());
}

/**
 * @param {string} name
 * @returns {import('./contract.js').Integration | null}
 */
export function findIntegration(name) {
  return REGISTERED.find((integration) => integration.name === name) ?? null;
}
