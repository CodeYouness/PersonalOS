#!/usr/bin/env node
/**
 * Restores the working data from the seed.
 *
 * The same thing as deleting data/personalos.json by hand, which is what the
 * guide suggests -- this just makes it a command you can run without thinking
 * about paths, and it respects DATA_DIR.
 *
 * It runs under plain Node because everything under lib/ does: no bundler,
 * no aliases. That rule is what will let the migration and backup scripts of
 * the full path reuse the same data layer.
 */

import { resetState, workingPath } from '../lib/adapters/json/file.js';

const backupPath = await resetState();
console.log('restored ' + workingPath() + ' from seed.json');
if (backupPath !== null) {
  console.log('the previous working data is backed up at ' + backupPath);
}
