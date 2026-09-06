#!/usr/bin/env node
/**
 * A destructive factory reset: throws the working data away and rebuilds it
 * from the seed. Not an undo -- there is no way back to what this discards
 * except the backup it writes first.
 *
 * The same thing as deleting data/personalos.json by hand, which is what the
 * guide suggests -- this just makes it a command you can run without thinking
 * about paths, and it respects DATA_DIR.
 *
 * It runs under plain Node because everything under lib/ does: no bundler,
 * no aliases. That rule is what lets this script reuse the real data layer
 * through lib/store.js instead of reaching around it for the adapter.
 */

import { describeStorage, resetToSeed } from '../lib/store.js';

const backupPath = await resetToSeed();
console.log('restored ' + describeStorage() + ' from seed.json');
if (backupPath !== null) {
  console.log('the previous working data is backed up at ' + backupPath);
}
