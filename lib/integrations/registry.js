/**
 * Which integrations exist in this deployment.
 *
 * Empty on purpose. Nothing external is wired up yet, and an integration that
 * exists before there is a concrete need is a credential surface with no
 * payoff. Adding one means: write it under lib/integrations/<name>/,
 * register it here, and flag it in personalos.config.js.
 */

import { features } from '../../personalos.config.js';
import { assertIsIntegration } from './contract.js';

/** @type {import('./contract.js').Integration[]} */
const REGISTERED = [];

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
