#!/usr/bin/env node
/**
 * `npm run launchd:plist`: prints the launchd agent definition for THIS
 * checkout on stdout. Paths come from where it runs, so nothing personal is
 * committed. Install steps are in docs/development.md. Logs go to ~/Library/Logs/PersonalOS
 * (pass `--log-dir <dir>` to change it).
 */

import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { launchdPlist } from '../lib/launchd.js';

const args = process.argv.slice(2);
const at = args.indexOf('--log-dir');
const logDir = at >= 0 && args[at + 1] ? resolve(args[at + 1]) : join(homedir(), 'Library', 'Logs', 'PersonalOS');
const npmPath = execFileSync('which', ['npm'], { encoding: 'utf8' }).trim();
const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

process.stdout.write(launchdPlist({ projectDir, npmPath, pathEnv: [dirname(npmPath), '/usr/local/bin', '/usr/bin', '/bin'].join(':'), logDir }));
