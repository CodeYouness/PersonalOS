#!/usr/bin/env node
/**
 * Fails if anything that must never be published is tracked by git.
 *
 * This repository is public and the application it builds handles net worth,
 * contacts and health data. A leak here is not fixed by deleting a file:
 * git history keeps it. Run before every push - `npm run check:secrets`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

/** Repo-relative paths that must never be tracked. */
const FORBIDDEN_PATHS = [
  // .env.example is documentation and carries no values.
  { pattern: /^\.env(?!\.example$)($|\.)/, reason: 'environment file with real values' },
  { pattern: /^data\/personalos\.json$/, reason: 'personal working data' },
  { pattern: /^PersonalOS\.md$/, reason: 'third-party reference material' },
  { pattern: /\.pem$/, reason: 'private key' },
  { pattern: /^data\/finance\//, reason: 'personal spreadsheet export' },
];

/** Credential signatures, matched against tracked text files. */
const FORBIDDEN_CONTENT = [
  { pattern: /sk-ant-[A-Za-z0-9_-]{20,}/, reason: 'Anthropic API key' },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, reason: 'private key block' },
  { pattern: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/, reason: 'Telegram bot token' },
  { pattern: /calendar\.google\.com\/calendar\/ical\/\S+/, reason: 'private iCal address' },
];

const SKIP_CONTENT_SCAN = /^(package-lock\.json|scripts\/check-secrets\.js)$/;
const MAX_SCAN_BYTES = 512 * 1024;

/** A NUL byte is the cheapest reliable signal that a file is binary. */
const NUL = String.fromCharCode(0);

/** @type {string[]} */
const problems = [];

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

for (const file of tracked) {
  for (const { pattern, reason } of FORBIDDEN_PATHS) {
    if (pattern.test(file)) {
      problems.push('must not be committed: ' + file + ' (' + reason + ')');
    }
  }

  if (SKIP_CONTENT_SCAN.test(file)) continue;

  let size;
  try {
    size = statSync(file).size;
  } catch {
    problems.push('tracked but missing from the working tree: ' + file);
    continue;
  }
  if (size > MAX_SCAN_BYTES) continue;

  let content = '';
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (content.includes(NUL)) continue;

  for (const { pattern, reason } of FORBIDDEN_CONTENT) {
    if (pattern.test(content)) {
      problems.push('possible ' + reason + ' in ' + file);
    }
  }
}

if (problems.length > 0) {
  console.error('check:secrets failed');
  for (const problem of problems) console.error('  - ' + problem);
  console.error('Untrack the file, and rewrite history if it was ever committed.');
  process.exit(1);
}

console.log('check:secrets passed (' + tracked.length + ' tracked files)');
