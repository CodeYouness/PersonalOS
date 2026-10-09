#!/usr/bin/env node
/**
 * Removes the seed's demo finance rows -- its accounts, their balances, trades
 * and transactions, its snapshot -- from your data file, so your own accounts do
 * not sit next to invented ones (#112). Finance categories and everything
 * that is not finance stay.
 *
 * Writes a backup first and prints where. Running it again removes nothing.
 * Nothing runs it automatically: it is yours to run once, when you start
 * recording your own money.
 *
 * Plain Node, through lib/store.js, like data:reset -- it respects DATA_DIR.
 */

import { describeStorage, removeDemoFinance } from '../lib/store.js';

const { backupPath, removed } = await removeDemoFinance();
console.log('removed from ' + describeStorage() + ':');
for (const [collection, count] of Object.entries(removed)) {
  console.log('  ' + collection + ': ' + count);
}
console.log('the data before the change is backed up at ' + backupPath);
