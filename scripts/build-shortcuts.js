#!/usr/bin/env node
/**
 * `npm run shortcuts:build`: writes the three iPhone Shortcuts, signed, to
 * ~/Downloads/PersonalOS-Shortcuts (ADR 0036, docs/shortcuts.md). macOS only:
 * it needs `plutil` and `shortcuts sign`, which signs with this Mac's iCloud
 * account.
 *
 * The host is the Mac's tailnet name, read from Tailscale; pass
 * `--host https://<name>` to set it. Pass `--out <dir>` to write elsewhere.
 * Neither the host nor the token is committed: the host is only the default
 * answer to an import question, and the token is asked for on import.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { SHORTCUT_NAMES, buildShortcut, toXmlPlist } from '../lib/shortcuts.js';

const TAILSCALE = ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];

/** @param {string} flag */
function option(flag) {
  const args = process.argv.slice(2);
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : undefined;
}

/** @returns {string | undefined} the Mac's tailnet URL, if Tailscale answers */
function tailnetHost() {
  for (const command of TAILSCALE) {
    try {
      const status = JSON.parse(execFileSync(command, ['status', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
      const name = String(status?.Self?.DNSName ?? '').replace(/\.$/, '');
      if (name) return 'https://' + name;
    } catch {
      // not installed under this name, or not running: try the next
    }
  }
  return undefined;
}

const host = option('--host') ?? tailnetHost();
if (!host) {
  console.error('No tailnet name: start Tailscale, or pass --host https://<mac>.<tailnet>.ts.net');
  process.exit(1);
}
const outDir = resolve(option('--out') ?? join(homedir(), 'Downloads', 'PersonalOS-Shortcuts'));

const work = await mkdtemp(join(tmpdir(), 'personalos-shortcuts-'));
try {
  await mkdir(outDir, { recursive: true });
  for (const name of SHORTCUT_NAMES) {
    const plist = join(work, name + '.plist');
    const unsigned = join(work, name + '.shortcut');
    const signed = join(outDir, name + '.shortcut');
    await writeFile(plist, toXmlPlist(buildShortcut(name, { host })));
    execFileSync('plutil', ['-convert', 'binary1', '-o', unsigned, plist]);
    if (existsSync(signed)) await rm(signed);
    execFileSync('shortcuts', ['sign', '--mode', 'anyone', '--input', unsigned, '--output', signed], { stdio: 'inherit' });
    console.log('signed', signed);
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
console.log('Host ' + host + '. Open each file to add it; the token is asked for on import.');
